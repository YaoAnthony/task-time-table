/**
 * CommandSystem — extensible in-game slash-command registry.
 *
 * Usage:
 *   commands.register('weather', 'set weather: rain | clear', (args) => { ... });
 *   const feedback = commands.execute('/weather rain');
 *
 * All handlers receive a string[] of arguments (everything after the command name).
 * Returning a string shows it as player feedback; returning void uses a default ack.
 *
 * Already registered by GameScene:
 *   /weather <rain|clear>   — change weather
 *   /time set <0-1440>      — jump to in-game minute
 *   /debug <on|off>         — toggle Arcade Physics debug view
 *   /help                   — list all commands
 */

export type CommandHandler = (args: string[]) => string | void;

interface CommandDef {
  description: string;
  handler: CommandHandler;
}

export class CommandSystem {
  private readonly registry = new Map<string, CommandDef>();

  /** Register a command. `name` is case-insensitive; omit the leading slash. */
  register(name: string, description: string, handler: CommandHandler): void {
    this.registry.set(name.toLowerCase(), { description, handler });
  }

  /**
   * Parse and execute a command string (leading `/` is optional).
   * Returns a player-facing feedback string.
   */
  execute(input: string): string {
    const clean = input.trim().replace(/^\//, '');
    const parts = clean.split(/\s+/);
    const name  = parts[0]?.toLowerCase() ?? '';
    const args  = parts.slice(1);

    if (!name) return '';

    const cmd = this.registry.get(name);
    if (!cmd) {
      return `未知命令: /${name}。输入 /help 查看可用命令。`;
    }

    try {
      return cmd.handler(args) ?? `✓ /${name}`;
    } catch (e) {
      return `命令错误: ${String(e)}`;
    }
  }

  /** Used by /help. */
  listHelp(): string {
    const lines: string[] = ['── 可用命令 ──'];
    for (const [name, def] of this.registry) {
      lines.push(`  /${name}  —  ${def.description}`);
    }
    return lines.join('\n');
  }
}
