import { registerFilesystemTools } from './filesystem/filesystem.tools.js'
import { registerGitTools } from './git/git.tools.js'
import { registerSearchTools } from './search/search.tools.js'
import { registerShellTools } from './shell/shell.tools.js'
import { toolRegistry } from './registry/tool.registry.js'

export function registerAllTools(): void {
  registerFilesystemTools(toolRegistry)
  registerShellTools(toolRegistry)
  registerSearchTools(toolRegistry)
  registerGitTools(toolRegistry)
  console.log('[Parallax][Tools] Registered:', toolRegistry.listTools().map(tool => tool.name).join(', '))
}