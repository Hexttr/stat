import { getServerSession, type NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { z } from "zod";

import { prisma } from "@/lib/prisma";

const credentialsSchema = z.object({
  loginCode: z.string().trim().min(3),
  password: z.string().min(8),
});

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "Login Code and Password",
      credentials: {
        loginCode: { label: "Login", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsedCredentials = credentialsSchema.safeParse(credentials);

        if (!parsedCredentials.success) {
          return null;
        }

        const loginCode = parsedCredentials.data.loginCode.trim().toLowerCase();

        const user = await prisma.user.findFirst({
          where: {
            OR: [{ loginCode }, { email: loginCode }],
          },
          include: {
            memberships: {
              include: {
                organization: {
                  include: {
                    region: true,
                  },
                },
              },
            },
          },
        });

        if (!user?.passwordHash || !user.isActive) {
          return null;
        }

        const isPasswordValid = await compare(
          parsedCredentials.data.password,
          user.passwordHash,
        );

        if (!isPasswordValid) {
          return null;
        }

        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });

        return {
          id: user.id,
          email: user.email,
          loginCode: user.loginCode,
          name: user.fullName,
          fullName: user.fullName,
          isActive: user.isActive,
          memberships: user.memberships.map((membership) => ({
            id: membership.id,
            role: membership.role,
            organizationId: membership.organizationId,
            organizationName: membership.organization.name,
            regionId: membership.organization.regionId,
            regionName: membership.organization.region?.fullName ?? null,
          })),
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.loginCode = user.loginCode;
        token.fullName = user.fullName;
        token.isActive = user.isActive;
        token.memberships = user.memberships;
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? "";
        session.user.loginCode = token.loginCode;
        session.user.fullName = token.fullName;
        session.user.isActive = token.isActive;
        session.user.memberships = token.memberships ?? [];
      }

      return session;
    },
  },
};

export function auth() {
  return getServerSession(authOptions);
}
