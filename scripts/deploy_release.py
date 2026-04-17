#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
import posixpath
import subprocess
import sys
import tarfile
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import PurePosixPath
from tempfile import NamedTemporaryFile

try:
    import paramiko
except ImportError as exc:  # pragma: no cover - operator-facing failure path
    raise SystemExit(
        "Missing dependency: paramiko. Install it with `pip install paramiko` and retry."
    ) from exc


REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DEFAULT_REMOTE_ROOT = "/opt/stat"
DEFAULT_APP_RELATIVE_PATH = "apps/web"
DEFAULT_SERVICE_NAME = "stat-web"


@dataclass
class DeployConfig:
    host: str
    user: str
    password: str
    sudo_password: str
    port: int
    remote_root: str
    app_relative_path: str
    service_name: str
    skip_install: bool
    skip_db_push: bool


def parse_args() -> DeployConfig:
    parser = argparse.ArgumentParser(
        description="Build and deploy the current repository state to the Ubuntu release server."
    )
    parser.add_argument("--host", default=os.getenv("STAT_DEPLOY_HOST"))
    parser.add_argument("--user", default=os.getenv("STAT_DEPLOY_USER"))
    parser.add_argument("--password", default=os.getenv("STAT_DEPLOY_PASSWORD"))
    parser.add_argument(
        "--sudo-password",
        default=os.getenv("STAT_DEPLOY_SUDO_PASSWORD") or os.getenv("STAT_DEPLOY_PASSWORD"),
    )
    parser.add_argument(
        "--port",
        type=int,
        default=int(os.getenv("STAT_DEPLOY_PORT", "22")),
    )
    parser.add_argument(
        "--remote-root",
        default=os.getenv("STAT_DEPLOY_REMOTE_ROOT", DEFAULT_REMOTE_ROOT),
    )
    parser.add_argument(
        "--app-relative-path",
        default=os.getenv("STAT_DEPLOY_APP_RELATIVE_PATH", DEFAULT_APP_RELATIVE_PATH),
    )
    parser.add_argument(
        "--service-name",
        default=os.getenv("STAT_DEPLOY_SERVICE_NAME", DEFAULT_SERVICE_NAME),
    )
    parser.add_argument(
        "--skip-install",
        action="store_true",
        help="Skip `npm ci` on the remote server.",
    )
    parser.add_argument(
        "--skip-db-push",
        action="store_true",
        help="Skip `npx prisma db push` on the remote server.",
    )
    args = parser.parse_args()

    missing = [
        name
        for name, value in (
            ("STAT_DEPLOY_HOST", args.host),
            ("STAT_DEPLOY_USER", args.user),
            ("STAT_DEPLOY_PASSWORD", args.password),
        )
        if not value
    ]
    if missing:
        raise SystemExit(
            "Missing deploy settings: "
            + ", ".join(missing)
            + ". Set them as environment variables or pass explicit flags."
        )

    return DeployConfig(
        host=args.host,
        user=args.user,
        password=args.password,
        sudo_password=args.sudo_password,
        port=args.port,
        remote_root=args.remote_root.rstrip("/"),
        app_relative_path=args.app_relative_path.strip("/"),
        service_name=args.service_name,
        skip_install=args.skip_install,
        skip_db_push=args.skip_db_push,
    )


def run_git(*args: str) -> str:
    result = subprocess.run(
        ["git", *args],
        cwd=REPO_ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout


def iter_release_files() -> list[str]:
    raw = run_git("ls-files", "-z", "--cached", "--others", "--exclude-standard")
    candidates = [path for path in raw.split("\0") if path]
    included: list[str] = []
    for relative_path in candidates:
        if should_skip(relative_path):
            continue
        full_path = os.path.join(REPO_ROOT, relative_path)
        if os.path.isfile(full_path):
            included.append(relative_path)
    return sorted(set(included))


def should_skip(relative_path: str) -> bool:
    normalized = relative_path.replace("\\", "/").lstrip("./")
    path_parts = normalized.split("/")
    basename = path_parts[-1]

    if normalized.startswith(".git/"):
        return True
    if path_parts[0] in {"forms", "forms-ex", "db"}:
        return True
    if "node_modules" in path_parts or ".next" in path_parts:
        return True
    if basename in {".env"} or basename.startswith(".env."):
        return True
    if normalized.endswith((".dump", ".tgz", ".tar")):
        return True

    return False


def build_release_archive(release_id: str) -> tuple[str, int]:
    release_files = iter_release_files()
    if not release_files:
        raise SystemExit("No files selected for release archive.")

    with NamedTemporaryFile(prefix=f"{release_id}-", suffix=".tgz", delete=False) as temp_file:
        archive_path = temp_file.name

    try:
        with tarfile.open(archive_path, "w:gz") as archive:
            for relative_path in release_files:
                full_path = os.path.join(REPO_ROOT, relative_path)
                archive.add(full_path, arcname=relative_path)
        archive_size = os.path.getsize(archive_path)
        return archive_path, archive_size
    except Exception:
        if os.path.exists(archive_path):
            os.remove(archive_path)
        raise


def connect_ssh(config: DeployConfig) -> paramiko.SSHClient:
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(
        hostname=config.host,
        port=config.port,
        username=config.user,
        password=config.password,
        timeout=20,
        look_for_keys=False,
        allow_agent=False,
    )
    return client


def run_remote(
    client: paramiko.SSHClient,
    command: str,
    *,
    sudo_password: str | None = None,
    timeout: int = 60 * 60,
) -> str:
    stdin, stdout, stderr = client.exec_command(command, timeout=timeout)
    if sudo_password is not None:
        stdin.write(sudo_password + "\n")
        stdin.flush()
    output = stdout.read().decode("utf-8", "ignore")
    error = stderr.read().decode("utf-8", "ignore")
    exit_status = stdout.channel.recv_exit_status()
    if exit_status != 0:
        raise RuntimeError(f"Remote command failed ({exit_status}): {command}\n{output}{error}")
    return output + error


def ensure_remote_directory(sftp: paramiko.SFTPClient, remote_path: str) -> None:
    current = ""
    for part in PurePosixPath(remote_path).parts:
        if part == "/":
            current = "/"
            continue
        current = posixpath.join(current, part)
        try:
            sftp.stat(current)
        except IOError:
            sftp.mkdir(current)


def upload_release_archive(
    client: paramiko.SSHClient,
    archive_path: str,
    config: DeployConfig,
    release_id: str,
) -> tuple[str, str]:
    releases_dir = posixpath.join(config.remote_root, "releases")
    release_dir = posixpath.join(releases_dir, release_id)
    remote_archive_path = posixpath.join(release_dir, "release.tgz")

    sftp = client.open_sftp()
    try:
        ensure_remote_directory(sftp, releases_dir)
        ensure_remote_directory(sftp, release_dir)
        sftp.put(archive_path, remote_archive_path)
    finally:
        sftp.close()

    return release_dir, remote_archive_path


def build_remote_deploy_script(config: DeployConfig, release_dir: str, remote_archive_path: str) -> str:
    app_dir = posixpath.join(release_dir, config.app_relative_path)
    env_link_path = posixpath.join(app_dir, ".env")
    shared_env_path = posixpath.join(config.remote_root, "shared", "env", "web.env")
    current_link = posixpath.join(config.remote_root, "current")

    install_step = "npm ci" if not config.skip_install else "echo '[SKIP] npm ci'"
    db_push_step = "npx prisma db push" if not config.skip_db_push else "echo '[SKIP] prisma db push'"

    return f"""#!/usr/bin/env bash
set -euo pipefail

echo "[DEPLOY] start $(date -Is)"
echo "[DEPLOY] release dir: {release_dir}"

mkdir -p "{release_dir}"
tar -xzf "{remote_archive_path}" -C "{release_dir}"

cd "{app_dir}"
rm -f "{env_link_path}"
ln -s "{shared_env_path}" "{env_link_path}"

{install_step}
npx prisma generate
{db_push_step}
npm run build

ln -sfn "{release_dir}" "{current_link}"
echo "[DEPLOY] switched current -> {release_dir}"
echo "[DEPLOY] done $(date -Is)"
"""


def deploy_release(config: DeployConfig) -> int:
    release_id = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    archive_path, archive_size = build_release_archive(release_id)
    print(f"[LOCAL] archive ready: {archive_path} ({archive_size} bytes)")

    client = connect_ssh(config)
    try:
        release_dir, remote_archive_path = upload_release_archive(client, archive_path, config, release_id)
        print(f"[REMOTE] uploaded archive to {remote_archive_path}")

        deploy_script = build_remote_deploy_script(config, release_dir, remote_archive_path)
        sftp = client.open_sftp()
        remote_script_path = posixpath.join(release_dir, "deploy.sh")
        try:
            with sftp.file(remote_script_path, "w") as remote_script:
                remote_script.write(deploy_script)
            sftp.chmod(remote_script_path, 0o755)
        finally:
            sftp.close()

        deploy_output = run_remote(client, f"bash {remote_script_path}", timeout=2 * 60 * 60)
        print(deploy_output.rstrip())

        restart_output = run_remote(
            client,
            f"sudo -S systemctl restart {config.service_name} && sudo -S systemctl is-active {config.service_name}",
            sudo_password=config.sudo_password,
            timeout=300,
        )
        print(restart_output.rstrip())

        health_output = run_remote(
            client,
            "curl -I http://127.0.0.1:3000/login | sed -n '1,10p'",
            timeout=120,
        )
        print(health_output.rstrip())
        print(f"[DONE] deployed release {release_id}")
        return 0
    finally:
        client.close()
        if os.path.exists(archive_path):
            os.remove(archive_path)


if __name__ == "__main__":
    sys.exit(deploy_release(parse_args()))
