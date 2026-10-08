import next from "eslint-config-next";

/**
 * ESLint 9 flat config. `eslint-config-next` is spread as an array of configs
 * (one per concern: core-web-vitals, react/hooks, typescript, import).
 *
 * Generated code and build output are excluded. `src/generated/` is the Prisma
 * client and is gitignored; `.next/` is the build output.
 */
const config = [
  {
    ignores: [".next/**", "node_modules/**", "src/generated/**", "next-env.d.ts"],
  },
  ...next,
];

export default config;
