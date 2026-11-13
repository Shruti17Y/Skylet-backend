  # Skylet Backend

Backend repository for the **Skylet** application. This repository contains the server-side source code and supporting scripts that power the Skylet platform.

## 🚀 Tech Stack

- **Node.js** – JavaScript runtime
- **Express.js** – Web application framework
- **JavaScript** – Backend application logic
- **npm** – Dependency management

## ⚙️ Getting Started

### Prerequisites

Make sure you have the following installed:

- [Node.js](https://nodejs.org/) (LTS version recommended)
- npm (included with Node.js)

### 1. Clone the Repository

```bash
git clone <YOUR_BACKEND_REPOSITORY_URL>
```

### 2. Open the Project Directory

```bash
cd skylet-backend
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Configure Environment Variables

Create a `.env` file in the project root and add the environment variables required by the application.

Example:

```env
PORT=5000
# Add the other environment variables required by your application.
```

Use the exact variable names expected by the backend. Never commit secrets, API keys, database credentials, or production environment files to GitHub.

### 5. Start the Server

Check the `scripts` section in `package.json` for the commands configured in this project.

Common examples:

```bash
npm start
```

Or, if a development script is available:

```bash
npm run dev
```

## 🔍 Verification Scripts

The repository includes the following verification scripts:

| Script | Purpose |
| --- | --- |
| `verify.js` | General verification |
| `verify_admin.js` | Admin verification |
| `verify_admin_workflow.js` | Admin workflow verification |

Run a script with Node.js when its required configuration is available:

```bash
node verify.js
node verify_admin.js
node verify_admin_workflow.js
```

## 📦 Available npm Commands

The available commands depend on the `scripts` section in `package.json`.

To list the configured commands, run:

```bash
npm run
```

## 🔐 Security

- Keep `.env` and other files containing secrets out of version control.
- Store credentials and sensitive configuration in environment variables.
- Never expose private keys, access tokens, or database passwords in source code.
- Validate requests and authorize protected routes and admin operations on the server.

## 🤝 Contributing

1. Create a feature branch.
2. Make your changes.
3. Test the affected functionality.
4. Commit your changes with a clear commit message.
5. Open a pull request.

## 👩‍💻 Developer

**Shruti Patel**

- **GitHub:** [Shruti17Y](https://github.com/Shruti17Y)
- **LinkedIn:** [Connect on LinkedIn](https://linkedin.com/in/shrutipatel1706/)

---

Built with ❤️ using **Node.js** and **JavaScript**.
