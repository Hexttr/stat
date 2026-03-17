import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      fullName?: string;
      isActive?: boolean;
      memberships: {
        id: string;
        role: string;
        organizationId: string;
        organizationName: string;
        regionId: string | null;
        regionName: string | null;
      }[];
    };
  }

  interface User {
    fullName?: string;
    isActive?: boolean;
    memberships?: {
      id: string;
      role: string;
      organizationId: string;
      organizationName: string;
      regionId: string | null;
      regionName: string | null;
    }[];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    fullName?: string;
    isActive?: boolean;
    memberships?: {
      id: string;
      role: string;
      organizationId: string;
      organizationName: string;
      regionId: string | null;
      regionName: string | null;
    }[];
  }
}
