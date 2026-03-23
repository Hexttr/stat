import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      loginCode?: string | null;
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
    loginCode?: string | null;
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
    loginCode?: string | null;
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
