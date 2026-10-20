import fs from "fs/promises";
import path from "path";

const REPO_ROOT = path.resolve(process.cwd());

const SAFE_COMMANDS = new Set([
  "pwd",
  "ls -la",
  "node --version",
  "npm --version",
  "npm test",
  "npm run build",
  "npm run start"
]);

function normalizeProjectPath(target = "") {
  const cleaned = String(target || "").replace(/^\/+/, "");
  const fullPath = path.resolve(REPO_ROOT, cleaned);

  if (!fullPath.startsWith(REPO_ROOT)) {
    throw new Error("Path outside repository is not allowed.");
  }

  return fullPath;
}

async function listProject(relativeDir = ".") {
  const projectPath = normalizeProjectPath(relativeDir);
  const entries = await fs.readdir(projectPath, { withFileTypes: true });
  const items = entries.map((entry) => ({
    name: entry.name,
    path: path.posix.join(relativeDir === "." ? "" : relativeDir, entry.name).replace(/^\/+|\/+$/g, "") || ".",
    type: entry.isDirectory() ? "dir" : "file"
  }));
  return items;
}

async function readProjectFile(relativePath) {
  const filePath = normalizeProjectPath(relativePath);
  const content = await fs.readFile(filePath, "utf8");
  return {
    path: path.relative(REPO_ROOT, filePath).split(path.sep).join("/"),
    content
  };
}

async function writeProjectFile(relativePath, content) {
  const filePath = normalizeProjectPath(relativePath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf8");
  return {
    path: path.relative(REPO_ROOT, filePath).split(path.sep).join("/"),
    saved: true
  };
}

async function runAllowedCommand(command = "") {
  const cleaned = String(command).trim();

  if (!SAFE_COMMANDS.has(cleaned)) {
    throw new Error(`Command not allowed in safe mode: ${cleaned}`);
  }

  const { exec } = await import("child_process");
  return await new Promise((resolve, reject) => {
    exec(cleaned, { cwd: REPO_ROOT, timeout: 120000 }, (error, stdout, stderr) => {
      if (error && !stdout && !stderr) {
        reject(new Error(error.message));
        return;
      }
      resolve({
        command: cleaned,
        stdout: stdout?.trim() || "",
        stderr: stderr?.trim() || "",
        exitCode: error ? error.code ?? 1 : 0
      });
    });
  });
}

export function registerSafeAgent(app) {
  app.get("/agent/health", (req, res) => {
    res.json({
      ok: true,
      mode: "safe-agent",
      repoRoot: REPO_ROOT,
      allowedCommands: [...SAFE_COMMANDS],
      note: "This agent can read/write only inside the project and only runs an explicit allowlist of commands."
    });
  });

  app.post("/agent/task", async (req, res) => {
    const { task, approved = false } = req.body || {};

    if (!task) {
      return res.status(400).json({ error: "A task description is required." });
    }

    const plan = [
      "Inspect the project layout and identify the relevant files.",
      "Implement the smallest safe change that satisfies the request.",
      "Validate the result with a safe command or project check.",
      "Report exactly what changed and any remaining risks."
    ];

    return res.json({
      ok: true,
      mode: "safe-agent",
      task,
      approved,
      plan,
      capabilities: {
        listFiles: true,
        readFiles: true,
        writeFiles: true,
        runCommands: approved,
        sandboxed: true
      }
    });
  });

  app.post("/agent/execute", async (req, res) => {
    const {
      action,
      path: targetPath,
      content,
      command,
      approved = false
    } = req.body || {};

    if (!approved) {
      return res.status(403).json({
        error: "Approval required before file writes or command execution."
      });
    }

    try {
      switch (action) {
        case "list": {
          const items = await listProject(targetPath || ".");
          return res.json({ ok: true, action, items });
        }

        case "read": {
          const file = await readProjectFile(targetPath || "");
          return res.json({ ok: true, action, file });
        }

        case "write": {
          if (typeof content !== "string") {
            return res.status(400).json({ error: "Content must be a string." });
          }
          const result = await writeProjectFile(targetPath || "", content);
          return res.json({ ok: true, action, result });
        }

        case "command": {
          const result = await runAllowedCommand(command || "");
          return res.json({ ok: true, action, result });
        }

        default:
          return res.status(400).json({ error: "Unsupported action." });
      }
    } catch (error) {
      return res.status(400).json({
        ok: false,
        error: error.message || "Safe agent operation failed."
      });
    }
  });
}
