# WA ParkStay Bookings - Documentation

Complete documentation for the WA ParkStay Bookings desktop application.

## Table of Contents

### For Users

- **[Installation Guide](./installation.md)** - How to install the application on Windows, macOS, or Linux
- **[User Guide](./user-guide.md)** - Complete guide to using all features of the application

### For Developers

- **[Development Guide](./development.md)** - Set up development environment and contribute to the project
- **[Architecture Documentation](./architecture/)** - Technical architecture and design decisions

### For Release Managers

- **[Release Process](./release-process.md)** - Complete release workflow and procedures
- **[Code Signing and Deployment](./code-signing-and-deployment.md)** - Code signing, packaging, and deployment
- **[Deployment Summary](./DEPLOYMENT-SUMMARY.md)** - Overview of all deployment configuration

### Quick Links

- **[Deployment Checklist](../DEPLOYMENT-CHECKLIST.md)** - Pre-release checklist
- **[Resources Guide](../resources/README.md)** - App icons and assets

## Documentation Structure

```
docs/
├── README.md (this file)          # Documentation index
├── installation.md                # Installation guide (37KB)
├── user-guide.md                  # User guide (56KB)
├── development.md                 # Development guide (43KB)
├── release-process.md             # Release process (38KB)
├── code-signing-and-deployment.md # Code signing guide (52KB)
├── DEPLOYMENT-SUMMARY.md          # Deployment overview (20KB)
└── architecture/                  # Architecture documentation
    ├── README.md
    ├── system-architecture.md
    ├── project-structure.md
    ├── data-models.md
    ├── architecture-diagrams.md
    ├── implementation-roadmap.md
    └── ADR-001-ui-framework-choice.md
```

## Getting Started

### I want to install and use the app
→ Start with [Installation Guide](./installation.md)
→ Then read [User Guide](./user-guide.md)

### I want to contribute to development
→ Start with [Development Guide](./development.md)
→ Then review [Architecture Documentation](./architecture/)

### I want to create a release
→ Review [Release Process](./release-process.md)
→ Check [Deployment Checklist](../DEPLOYMENT-CHECKLIST.md)
→ Follow [Code Signing Guide](./code-signing-and-deployment.md)

## Key Documents

### Installation Guide
Comprehensive installation instructions for all platforms:
- System requirements
- Step-by-step installation (Windows, macOS, Linux)
- First-run setup
- Troubleshooting common issues
- Uninstallation procedures
- Update instructions

### User Guide
Complete guide to using the application:
- Dashboard overview
- Managing bookings
- Creating and managing watches
- Using Skip The Queue
- Notifications and settings
- Tips and best practices
- Extensive FAQ

### Development Guide
Everything you need to contribute:
- Development environment setup
- Project structure
- Building and testing
- Code style and conventions
- Contributing guidelines
- Debugging techniques
- Common development tasks

### Release Process
Complete release workflow:
- Semantic versioning
- Release checklist
- Step-by-step guide
- Changelog management
- Distribution strategy
- Rollback procedures

### Code Signing and Deployment
Packaging and distribution:
- Code signing for all platforms
- App icons and assets
- Auto-update configuration
- Build scripts
- Troubleshooting

## Documentation Standards

### Writing Style
- Clear and concise
- Use active voice
- Include examples
- Step-by-step instructions
- Screenshots where helpful

### Code Examples
```bash
# Always include working examples
npm install
npm run dev
```

### Structure
- Table of contents for long documents
- Hierarchical headings
- Cross-references to related docs
- Version information and dates

## Contributing to Documentation

### Reporting Issues
If you find errors or areas for improvement:
1. Open an issue on GitHub
2. Describe the problem clearly
3. Suggest improvements
4. Reference specific sections

### Submitting Changes
1. Fork the repository
2. Make your changes
3. Test all examples
4. Submit a pull request
5. Describe your changes

### Guidelines
- Keep language simple and clear
- Test all code examples
- Update table of contents
- Check for broken links
- Maintain consistent formatting
- Update version dates

## Documentation Versions

All documentation is versioned with the application:
- **Current Version:** 1.0
- **Last Updated:** 2025-10-31
- **Documentation Status:** Complete

## Additional Resources

### External Documentation
- [Electron Documentation](https://www.electronjs.org/docs/latest)
- [React Documentation](https://react.dev/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Electron Builder](https://www.electron.build/)

### Project Resources
- [GitHub Repository](https://github.com/your-username/parkstay-bookings)
- [Issue Tracker](https://github.com/your-username/parkstay-bookings/issues)
- [Discussions](https://github.com/your-username/parkstay-bookings/discussions)
- [Releases](https://github.com/your-username/parkstay-bookings/releases)

## Getting Help

### For Users
- Check [User Guide](./user-guide.md) FAQ section
- Review [Installation Guide](./installation.md) troubleshooting
- Open an issue on GitHub
- Ask in GitHub Discussions

### For Developers
- Read [Development Guide](./development.md)
- Review [Architecture Documentation](./architecture/)
- Search existing issues
- Ask in GitHub Discussions

### For Release Managers
- Follow [Release Process](./release-process.md)
- Use [Deployment Checklist](../DEPLOYMENT-CHECKLIST.md)
- Review [Code Signing Guide](./code-signing-and-deployment.md)
- Contact maintainers if needed

## Documentation Maintenance

### Regular Updates
- Update after each release
- Add new features to user guide
- Update troubleshooting sections
- Refresh screenshots
- Verify all links

### Review Schedule
- Minor updates: With each release
- Major review: Quarterly
- Architecture docs: When architecture changes
- User guide: When features change

## License

This documentation is part of the WA ParkStay Bookings project and is licensed under the MIT License. See [LICENSE](../LICENSE) for details.

---

**Questions or feedback about documentation?**
Open an issue on GitHub or start a discussion.

**Want to contribute?**
See [Development Guide](./development.md) for contribution guidelines.

---

**Document Version:** 1.0
**Last Updated:** 2025-10-31
