/** True when site is deployed for broker testing — SEO and indexing disabled. */
export const IS_PRELAUNCH = process.env.NEXT_PUBLIC_PRELAUNCH === "true";

export const PRELAUNCH_ROBOTS = {
  index: false,
  follow: false,
  nocache: true,
  googleBot: {
    index: false,
    follow: false,
    noimageindex: true,
    nosnippet: true,
    noarchive: true,
  },
} as const;

export const X_ROBOTS_TAG_VALUE =
  "noindex, nofollow, noarchive, nosnippet, noimageindex";
