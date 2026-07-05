# Changelog

## v0.7.1 — Python venv self-repair

### Fixed

- Detect a virtual environment whose Python executable exists but `pip` is missing.
- Bootstrap `pip` with Python's standard `ensurepip` mechanism before dependency installation.
- Recreate `.venv` automatically if `ensurepip` cannot repair the existing environment.
- Verify `pip` before any `pip install` command.
- Include the exact Python patch version and base interpreter prefix in the Python dependency fingerprint.

### Added

- `yarn repair:python` for a clean Python-environment rebuild.
- `yarn smoke:python-bootstrap` to reproduce and verify recovery from a missing-pip virtual environment.

### Data safety

Python environment repair only modifies `.venv`. It never removes:

```text
data/
journal.db
media
transcripts
lessons
journal entries
learning progress
```

## v0.7.0 — Automatic URL-to-Lesson Pipeline

See previous release notes for automatic source acquisition and URL-driven analysis.
