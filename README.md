<p align="center">
  <img src="src/renderer/assets/layout/frame-top-center.gif" width="100%" />
</p>

<h1 align="center">POE Unofficial Launcher</h1>

<p align="center">
  <img src="https://img.shields.io/github/v/release/NERDHEAD-lab/POE2-unofficial-launcher?include_prereleases&style=flat-square" />
  <img src="https://img.shields.io/github/license/NERDHEAD-lab/POE2-unofficial-launcher?style=flat-square" />
  <img src="https://img.shields.io/github/downloads/NERDHEAD-lab/POE2-unofficial-launcher/total?style=flat-square" />
</p>

<p align="center">
  <a href="README.md"><b>EN</b></a> | <a href="docs/README_KR.md"><b>KR</b></a>
</p>

> **Disclaimer**: This is an **unofficial** launcher for **Path of Exile** & **Path of Exile 2**. It is not affiliated with Grinding Gear Games or Kakao Games. Use at your own risk.

An Electron-based unofficial launcher designed to automate the launch process for **Path of Exile** and **Path of Exile 2**. It supports both Kawao Games and Grinding Gear Games (GGG) platforms, providing a streamlined experience by automatically handling login, Designated PC checks, and intro modals.

<p align="center">
  <img src="docs/PoE%20Unofficial%20Launcher%20preview.gif" width="100%" />
</p>

## Key Features

- **Automated Game Launch**: Automatically handles the entire launch sequence for **Path of Exile 1 & 2** (Kakao Games / GGG).
- **Popup Automation**: Checks and confirms "Designated PC" (지정 PC), "Login Required", and "Intro" modals without user intervention.
- **DaumGameStarter UAC Bypass**: Launches the game immediately without User Account Control (UAC) prompts (based on Windows Scheduler).
- **Patch Error Auto-fix**: Automatically detects and recovers from persistent patch errors such as 'Transferred a partial file'.
- **Dual Window Architecture**:
  - **Main Window**: Clean UI for launcher status and control.
  - **Background Processing**: Handles the actual Daum Game Starter web process in an inactive window, invisible to the user.
- **Secure Handling**: Does not store password data; relies on session cookies and existing browser login states where possible.

## Installation

1. Go to the [Releases](https://github.com/NERDHEAD-lab/POE2-unofficial-launcher/releases) page.
2. Download the latest `Setup.exe`.
3. Run the installer.

## Development

### Prerequisites

- Node.js (v18 or higher)
- npm or yarn

### Setup

```bash
# Clone the repository
git clone https://github.com/NERDHEAD-lab/POE2-unofficial-launcher.git

# Install dependencies & Setup environment
npm run setup
```

### Running Locally

```bash
# Run in development mode
npm run dev

# Run in debug mode (Show Game Window & DevTools)
npm run dev:test
```

### Building

```bash
# Build for production (Windows)
npm run build
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the [GNU Affero General Public License v3.0](LICENSE).

## Repository

[https://github.com/NERDHEAD-lab/POE2-unofficial-launcher](https://github.com/NERDHEAD-lab/POE2-unofficial-launcher)

## Support

If you find this project helpful, please consider supporting the developer. [More Info](./docs/SUPPORT.md)

<p align="center">
  <img src="src/renderer/assets/layout/banner-bottom.png" width="100%" />
</p>
