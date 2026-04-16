# todo-checklist - nomi-logger

Steps 1-8 are complete. Build is clean (dist/index.js confirmed). 11/11 tests pass. Only publish remains.

---

## Step 9 - Build, test, and publish to GitHub Packages

### 9.1 - Build and tests [DONE]

```bash
npm run build   # dist/index.js and dist/index.d.ts present and correct
npm test        # 11/11 tests pass
```

### 9.2 - Add .npmrc to repo root [ ]

Create `.npmrc` in the project root:

```
@nomi-labs:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

> Commit this file. NODE_AUTH_TOKEN comes from environment - never hardcode it.

### 9.3 - GitHub Actions publish workflow [ ]

Create `.github/workflows/publish.yml`:

```yaml
name: Publish to GitHub Packages

on:
  push:
    tags:
      - 'v*'

jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          registry-url: 'https://npm.pkg.github.com'
          scope: '@nomi-labs'

      - name: Install dependencies
        run: npm ci
        env:
          NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Build
        run: npm run build

      - name: Run tests
        run: npm test

      - name: Publish
        run: npm publish
        env:
          NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

> GITHUB_TOKEN is provided automatically by GitHub Actions - no manual secret needed.

### 9.4 - Tag v1.0.0 and push [ ]

```bash
git add -A
git commit -m "feat: initial release of nomi-logger"
git tag v1.0.0
git push origin main --tags
```

GitHub Actions picks up the v* tag and runs the publish workflow automatically.

### 9.5 - Install in nomi-core [ ]

Add `.npmrc` in the consuming service root:

```
@nomi-labs:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

Then install:

```bash
NODE_AUTH_TOKEN=your_github_pat npm install @nomi-labs/nomi-logger
```

### 9.6 - Smoke test in nomi-core [ ]

```typescript
// app.module.ts
import { NomiLoggerModule } from '@nomi-labs/nomi-logger';

@Module({
  imports: [NomiLoggerModule],
})
export class AppModule {}
```

```typescript
// any service
import { NomiLoggerService } from '@nomi-labs/nomi-logger';

constructor(private readonly logger: NomiLoggerService) {}

this.logger.info('nomi-logger wired up', {
  traceId: 'smoke-test',
  userId: 'user-001',
  featureId: 'smoke-test',
  service: 'nomi-core',
});
```

Set LOG_LEVEL=info in the environment and confirm structured log output appears.

---

## Remaining Checklist

| Sub-step | Task                            | Status      |
|----------|---------------------------------|-------------|
| 9.2      | Add .npmrc to repo root         | [ ] not done |
| 9.3      | GitHub Actions publish workflow | [ ] not done |
| 9.4      | Tag v1.0.0 and push             | [ ] not done |
| 9.5      | Install in nomi-core            | [ ] not done |
| 9.6      | Smoke test in nomi-core         | [ ] not done |