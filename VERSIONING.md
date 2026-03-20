# Versioning Strategy

This template uses a consistent versioning approach for dependencies:

## Package Version Ranges

- **Caret notation (^)**: Used for all dependencies to allow compatible updates
  - `^1.2.3` allows updates to `<2.0.0` (patch and minor updates)
  - Provides flexibility while maintaining compatibility
  - Enables automatic security patches and bug fixes

## Node.js Version

- **Pinned version**: `.nvmrc` specifies exact Node.js version (`22.20.0`)
  - Ensures reproducible environments across development and CI
  - Prevents issues from Node.js version differences
  - Based on latest LTS (Long Term Support) release

## Rationale

- **Dependencies**: Caret ranges balance stability with security/bug fixes
- **Runtime**: Pinned Node.js version ensures consistent behavior
- **CI/CD**: Uses same pinned Node.js version for reliable builds

## Updating

1. Dependencies: Use `npm update` to get latest compatible versions
2. Node.js: Manually update `.nvmrc` and GitHub Actions when upgrading
3. Major updates: Review breaking changes before upgrading