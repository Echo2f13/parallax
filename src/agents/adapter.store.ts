import type { ChatGPTBrowserAdapter } from './chatgpt/browser.adapter.js'

let chatgptAdapter: ChatGPTBrowserAdapter | null = null

export function setChatGPTAdapter(adapter: ChatGPTBrowserAdapter): void { chatgptAdapter = adapter }
export function getChatGPTAdapter(): ChatGPTBrowserAdapter | null { return chatgptAdapter }
export function clearChatGPTAdapter(): void { chatgptAdapter = null }