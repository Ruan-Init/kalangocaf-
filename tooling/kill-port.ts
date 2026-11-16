import { readdirSync, readFileSync, readlinkSync } from "node:fs";
import ports from "../__ports.cjs";

const port = String(ports.website);
const isWindows = process.platform === "win32";
if (isWindows) {
  const result = Bun.spawnSync(["netstat", "-ano", "-p", "TCP"], { stdout: "pipe", stderr: "pipe" });
  const pids = new Set(result.stdout.toString().split("\n")
    .filter((line) => new RegExp(`:${port}\\s`).test(line) && line.includes("LISTENING"))
    .map((line) => line.trim().split(/\s+/).at(-1)!).filter((pid) => /^\d+$/.test(pid)));
  for (const pid of pids) Bun.spawnSync(["taskkill", "/PID", pid, "/F"], { stdout: "inherit", stderr: "inherit" });
} else if (Bun.which("lsof")) {
  const result = Bun.spawnSync(["lsof", "-t", `-iTCP:${port}`, "-sTCP:LISTEN"], { stdout: "pipe", stderr: "pipe" });
  const pids = [...new Set(result.stdout.toString().trim().split(/\s+/).filter((x) => /^\d+$/.test(x)))];
  for (const pid of pids) { try { process.kill(Number(pid), "SIGTERM"); } catch {} }
} else if (Bun.which("fuser")) {
  Bun.spawnSync(["fuser", "-k", `${port}/tcp`], { stdout: "inherit", stderr: "inherit" });
} else if (process.platform === "linux") {
  // Minimal VPS images may have neither lsof nor fuser. Resolve only listeners on our port.
  const hex = Number(port).toString(16).toUpperCase().padStart(4, "0");
  const inodes = new Set<string>();
  for (const file of ["/proc/net/tcp", "/proc/net/tcp6"]) {
    try {
      for (const line of readFileSync(file, "utf8").trim().split("\n").slice(1)) {
        const fields = line.trim().split(/\s+/);
        if (fields[1]?.endsWith(`:${hex}`) && fields[3] === "0A") inodes.add(fields[9]);
      }
    } catch {}
  }
  for (const pid of readdirSync("/proc").filter((name) => /^\d+$/.test(name))) {
    if (Number(pid) === process.pid) continue;
    try {
      const ownsSocket = readdirSync(`/proc/${pid}/fd`).some((fd) => {
        try { return inodes.has(readlinkSync(`/proc/${pid}/fd/${fd}`).match(/^socket:\[(\d+)\]$/)?.[1] ?? ""); }
        catch { return false; }
      });
      if (ownsSocket) process.kill(Number(pid), "SIGTERM");
    } catch {}
  }
} else {
  console.error(`Para liberar a porta ${port}, encerre o servidor no terminal (Ctrl+C). lsof/fuser não estão instalados.`);
  process.exit(1);
}
console.log(`Verificação da porta ${port} concluída.`);