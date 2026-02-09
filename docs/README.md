# WA ParkStay Bookings - Documentation

Complete documentation for the WA ParkStay Bookings desktop application.

## Table of Contents

### For Users

- **[Installation Guide](./installation.md)** - How to install the application on Windows, macOS, or Linux
- **[User Guide](./user-guide.md)** - Complete guide to using all features of the application

### For Developers

- **[Development Guide](./development.md)** - Set up development environment and contribute to the project
- **[Architecture Documentation](./architecture/)** - Technical architecture and design decisions
- **[Implementation Plan](./IMPLEMENTATION_PLAN.md)** - Detailed implementation plan
- **[Advanced Features Guide](./ADVANCED_FEATURES_GUIDE.md)** - Watch, STQ, and notification deep-dive

### Gmail Integration

- **[Gmail OTP Quick Start](./gmail-otp-quick-start.md)** - Get started with Gmail OAuth2 OTP extraction
- **[Gmail OTP Setup](./gmail-otp-setup.md)** - Detailed Gmail OAuth2 setup guide
- **[Gmail Usage Examples](./gmail-usage-examples.md)** - Usage examples and patterns
- **[Gmail Integration Summary](./GMAIL-INTEGRATION-SUMMARY.md)** - Overview of the Gmail integration

### ParkStay API

- **[ParkStay API Overview](./parkstay-api/README.md)** - API documentation overview
- **[Authentication Flow](./parkstay-api/AUTHENTICATION_FLOW.md)** - ParkStay authentication details
- **[API Endpoints](./parkstay-api/ENDPOINTS.md)** - Available ParkStay API endpoints

### For Release Managers

- **[Release Process](./release-process.md)** - Complete release workflow and procedures
- **[Code Signing and Deployment](./code-signing-and-deployment.md)** - Code signing, packaging, and deployment
- **[Deployment Summary](./DEPLOYMENT-SUMMARY.md)** - Overview of all deployment configuration
- **[Setup Checklist](./SETUP-CHECKLIST.md)** - Environment setup checklist

### Quick Links

- **[Deployment Checklist](../DEPLOYMENT-CHECKLIST.md)** - Pre-release checklist
- **[Resources Guide](../resources/README.md)** - App icons and assets

## Documentation Structure

```
docs/
├── README.md (this file)              # Documentation index
├── installation.md                    # Installation guide
├── user-guide.md                      # User guide
├── development.md                     # Development guide
├── release-process.md                 # Release process
├── code-signing-and-deployment.md     # Code signing guide
├── DEPLOYMENT-SUMMARY.md             # Deployment overview
├── SETUP-CHECKLIST.md                # Setup checklist
├── ADVANCED_FEATURES_GUIDE.md        # Advanced features deep-dive
├── IMPLEMENTATION_PLAN.md            # Implementation plan
├── gmail-otp-setup.md                # Gmail OAuth2 setup
├── gmail-otp-quick-start.md          # Gmail quick start
├── gmail-usage-examples.md           # Gmail usage examples
├── GMAIL-INTEGRATION-SUMMARY.md      # Gmail integration overview
├── architecture/                      # Architecture documentation
│   ├── README.md
│   ├── system-architecture.md
│   ├── project-structure.md
│   ├── data-models.md
│   ├── architecture-diagrams.md
│   ├── implementation-roadmap.md
│   └── ADR-001-ui-framework-choice.md
└── parkstay-api/                      # ParkStay API documentation
    ├── README.md
    ├── AUTHENTICATION_FLOW.md
    └── ENDPOINTS.md
```

## Getting Started

### I want to install and use the app
> Start with [Installation Guide](./installation.md)
> Then read [User Guide](./user-guide.md)

### I want to contribute to development
> Start with [Development Guide](./development.md)
> Then review [Architecture Documentation](./architecture/)

### I want to set up Gmail integration
> Start with [Gmail OTP Quick Start](./gmail-otp-quick-start.md)
> Then see [Gmail OTP Setup](./gmail-otp-setup.md) for detailed instructions

### I want to create a release
> Review [Release Process](./release-process.md)
> Check [Deployment Checklist](../DEPLOYMENT-CHECKLIST.md)
> Follow [Code Signing Guide](./code-signing-and-deployment.md)

## Key Documents

### User Guide
Complete guide to using the application:
- Dashboard overview
- Managing bookings
- Creating and managing watches
- Using Skip The Queue
- Notifications and email alerts
- Queue system handling
- Settings (including email/SMTP configuration)
- Tips and best practices
- Extensive FAQ

### Development Guide
Everything you need to contribute:
- Development environment setup
- Project structure
- Building and testing
- Code style and conventions
- Contributing guidelines

### Gmail Integration
OAuth2-based Gmail integration for:
- Extracting OTP codes from ParkStay emails
- Automated authentication flow support

### ParkStay API
Documentation of the ParkStay API:
- Authentication flow (Azure AD B2C)
- Available endpoints
- Queue system handling

## Documentation Standards

### Writing Style
- Clear and concise
- Use active voice
- Include examples
- Step-by-step instructions

### Code Examples
```bash
# Always include working examples
npm install
npm run dev
```

## Contributing to Documentation

### Reporting Issues
If you find errors or areas for improvement:
1. Open an issue on [GitHub](https://github.com/wilsonwaters/parkstay-bookings/issues)
2. Describe the problem clearly
3. Suggest improvements

### Submitting Changes
1. Fork the repository
2. Make your changes
3. Test all examples
4. Submit a pull request

## Additional Resources

### External Documentation
- [Electron Documentation](https://www.electronjs.org/docs/latest)
- [React Documentation](https://react.dev/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Electron Builder](https://www.electron.build/)

### Project Resources
- [GitHub Repository](https://github.com/wilsonwaters/parkstay-bookings)
- [Issue Tracker](https://github.com/wilsonwaters/parkstay-bookings/issues)
- [Discussions](https://github.com/wilsonwaters/parkstay-bookings/discussions)
- [Releases](https://github.com/wilsonwaters/parkstay-bookings/releases)

---

**Document Version:** 1.0.0
**Last Updated:** 2026-02-09
