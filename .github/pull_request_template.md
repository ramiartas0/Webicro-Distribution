## Summary of Changes
Provide a brief, high-level description of what this PR does and why it is needed.

Related Issue: Fixes #

---

## Type of Change
Select all that apply:
- [ ] `feat`: New feature or enhancement
- [ ] `fix`: Bug fix
- [ ] `refactor`: Code refactoring without behavioral change
- [ ] `docs`: Documentation update
- [ ] `perf`: Performance optimization
- [ ] `test`: Unit / Integration tests
- [ ] `chore`: Build, CI, or dependency update

---

## Targeted Branch
- [ ] **`develop`** (Default for all new features and bug fixes)
- [ ] **`main`** (Only for critical hotfixes or scheduled major releases)

---

## Pre-Merge Quality Checklist
Please verify each of the following before requesting review:

- [ ] Code strictly complies with TypeScript strict mode (No `any`, No `@ts-ignore`).
- [ ] Zero lint errors: `pnpm lint` passed cleanly.
- [ ] All package builds succeed: `pnpm build` completed with code 0.
- [ ] Monorepo typecheck passed: `pnpm -r typecheck` passed with 0 errors.
- [ ] All tests pass: `pnpm test` (35+ test suite green).
- [ ] Zero emojis standard maintained: No emojis introduced in code, CLI messages, or documentation.
- [ ] Commit history follows Conventional Commits format (`type(scope): message`).
- [ ] Branch rebased cleanly on latest `develop`.
