#!/usr/bin/env python3
"""
⚡ PROMPTCRAFT // VR DEVELOPMENTS
Python CLI Terminal Prompt Generator powered by Groq LPUs.
Run with: python3 groq_cli.py
"""

import os
import sys
import time
import argparse
from typing import List, Dict

try:
    from rich.console import Console
    from rich.panel import Panel
    from rich.markdown import Markdown
    from rich.table import Table
    from rich.text import Text
    from rich.live import Live
    from rich.prompt import Prompt
except ImportError:
    print("Error: 'rich' library is required. Install with: pip install rich")
    sys.exit(1)

try:
    from groq import Groq, AuthenticationError, APIError
    GROQ_AVAILABLE = True
except ImportError:
    GROQ_AVAILABLE = False

console = Console()

PROMPTCRAFT_SYSTEM = """You are PromptCraft, an elite AI Prompt Generator developed by VR DEVELOPMENTS.
Your SOLE purpose is to generate world-class, production-ready system/user prompts that users can directly copy and paste into any AI (ChatGPT, Claude, Gemini, Cursor, v0, etc.) to achieve flawless results.

STRICT OPERATING RULES:
1. CASUAL / POLITE CHAT:
   - If the user says a greeting or polite closing (e.g. "thanks", "cool tq", "hi", "awesome", "ok", "got it", "hello"), reply naturally in 1 short friendly sentence like: "You're welcome! Whenever you need another prompt, just drop the topic or idea here."
   - DO NOT put polite chat inside code blocks.

2. FOR PROMPT REQUESTS (Topics, Ideas, Goals, Tasks):
   - You MUST output EXACTLY ONE unified master prompt enclosed inside a single code fence:
     ````prompt
     [Master Prompt Content Here]
     ````
   - ALWAYS output ONE single master prompt. NEVER split a project into separate code blocks for different files (e.g., DO NOT output /index.html, /styles.css, /main.js separately). Instead, write the unified prompt instructing the target AI how to build the entire system/app/project.
   - Do NOT include conversational filler, strategy tips, pro tips, or multiple options outside the prompt block.
   - Output ONLY the prompt block!
"""

DEFAULT_MODELS = [
    ("openai/gpt-oss-120b", "OpenAI GPT-OSS 120B", "Flagship open reasoning model (~500 tok/s, Production)"),
    ("openai/gpt-oss-20b", "OpenAI GPT-OSS 20B", "Ultra-fast reasoning model (~1000 tok/s, Production)"),
    ("qwen/qwen3.8-27b", "Qwen 3.8 27B", "Alibaba Cloud model on Groq LPUs (~450 tok/s)"),
    ("minimaxai/minimax-m2.7", "MiniMax M2.7", "Enterprise large context model (~260 tok/s)")
]

ASCII_BANNER = r"""
  ____  ____   ___  __  __ ____ _____ ____ ____      _    _____ _____ 
 |  _ \|  _ \ / _ \|  \/  |  _ \_   _/ ___|  _ \    / \  |  ___|_   _|
 | |_) | |_) | | | | |\/| | |_) || || |   | |_) |  / _ \ | |_    | |  
 |  __/|  _ <| |_| | |  | |  __/ | || |___|  _ <  / ___ \|  _|   | |  
 |_|   |_| \_\\___/|_|  |_|_|    |_| \____|_| \_\/_/   \_\_|     |_|  
                  // VR DEVELOPMENTS // GROQ LPU
"""

class PromptCraftCLI:
    def __init__(self, model: str = "openai/gpt-oss-120b", api_key: str = None):
        self.model = model
        self.api_key = api_key or os.environ.get("GROQ_API_KEY", "").strip()
        self.history: List[Dict[str, str]] = []
        self.total_tokens = 0
        self.start_time = time.time()
        self.client = None

        if self.api_key and GROQ_AVAILABLE:
            try:
                self.client = Groq(api_key=self.api_key)
            except Exception:
                self.client = None

    def print_banner(self):
        console.clear()
        banner_text = Text(ASCII_BANNER, style="bold cyan")
        console.print(banner_text)
        
        status_color = "bold green" if self.client else "bold yellow"
        status_text = "● LIVE GROQ ONLINE" if self.client else "● DEMO PREVIEW (No API Key set)"
        
        info_panel = Panel(
            f"[{status_color}]{status_text}[/{status_color}]  |  "
            f"[bold magenta]Model:[/bold magenta] {self.model}  |  "
            f"[bold yellow]Engine:[/bold yellow] PromptCraft AI\n"
            f"[dim]Enter any topic/idea to craft a prompt. Type [bold white]/help[/bold white] for commands, [bold white]/exit[/bold white] to quit.[/dim]",
            title="[bold yellow]🎯 PROMPTCRAFT // VR DEVELOPMENTS[/bold yellow]",
            border_style="cyan"
        )
        console.print(info_panel)
        console.print()

    def show_help(self):
        table = Table(title="🎯 PromptCraft Commands", border_style="cyan", show_header=True)
        table.add_column("Command", style="bold yellow", width=18)
        table.add_column("Description", style="white")

        commands = [
            ("/help", "Show this commands manual"),
            ("/models", "List available Groq models"),
            ("/model <id>", "Switch current AI model"),
            ("/key <api_key>", "Set your Groq API key (starts with gsk_...)"),
            ("/clear", "Clear terminal screen"),
            ("/exit or /quit", "Exit PromptCraft")
        ]
        for cmd, desc in commands:
            table.add_row(cmd, desc)
        console.print(table)
        console.print()

    def show_models(self):
        table = Table(title="🤖 Groq Production Models", border_style="magenta", show_header=True)
        table.add_column("Model ID", style="bold cyan")
        table.add_column("Name", style="bold white")
        table.add_column("Specifications", style="dim white")

        for mid, name, desc in DEFAULT_MODELS:
            active_marker = " [bold green]★ ACTIVE[/bold green]" if mid == self.model else ""
            table.add_row(mid + active_marker, name, desc)
        console.print(table)
        console.print()

    def set_key(self, key: str):
        key = key.strip()
        if not key:
            console.print("[bold red]API key cannot be empty.[/bold red]\n")
            return
        
        with console.status("[bold cyan]Validating key with Groq...[/bold cyan]", spinner="dots"):
            try:
                test_client = Groq(api_key=key)
                models = test_client.models.list()
                self.api_key = key
                self.client = test_client
                console.print(f"[bold green]✔ Authenticated! Found {len(models.data)} models. PromptCraft live![/bold green]\n")
            except Exception as e:
                console.print(f"[bold red]✖ Authentication failed: {e}[/bold red]\n")

    def execute_command(self, cmd_line: str) -> bool:
        parts = cmd_line.strip().split(maxsplit=1)
        cmd = parts[0].lower()
        arg = parts[1].strip() if len(parts) > 1 else ""

        if cmd in ("/exit", "/quit", "/q"):
            console.print("[bold yellow]🎯 PromptCraft session closed. Happy prompting![/bold yellow]")
            return False
        elif cmd in ("/help", "/h", "/?"):
            self.show_help()
        elif cmd == "/models":
            self.show_models()
        elif cmd == "/model":
            if arg:
                self.model = arg
                console.print(f"[bold green]Switched model to:[/bold green] [bold cyan]{self.model}[/bold cyan]\n")
            else:
                console.print(f"[bold yellow]Current model:[/bold yellow] [bold cyan]{self.model}[/bold cyan]. Use: /model <id>\n")
        elif cmd == "/key":
            if arg:
                self.set_key(arg)
            else:
                key_input = Prompt.ask("[bold yellow]Enter Groq API Key (starts with gsk_)[/bold yellow]", password=True)
                if key_input:
                    self.set_key(key_input)
        elif cmd in ("/clear", "/cls"):
            self.print_banner()
        else:
            console.print(f"[bold red]Unknown command: {cmd}. Type /help for assistance.[/bold red]\n")
        return True

    def craft_prompt(self, idea: str):
        self.history.append({"role": "user", "content": idea})
        messages = [{"role": "system", "content": PROMPTCRAFT_SYSTEM}] + self.history[-6:]

        console.print(f"\n[bold cyan]🎯 PromptCraft Master Prompt[/bold cyan] [dim][{self.model}][/dim]:\n")

        if not self.client:
            demo_text = (
                f"### 🎯 Master Prompt Crafted for: \"{idea}\"\n\n"
                f"```markdown\n"
                f"# ROLE & PERSONA\n"
                f"Act as a World-Class Subject Matter Expert and Principal Strategist for {idea}.\n\n"
                f"# OBJECTIVE\n"
                f"Deliver a rigorous, high-converting, and actionable blueprint addressing all aspects of the goal.\n\n"
                f"# STRICT CONSTRAINTS\n"
                f"- No conversational fluff or filler.\n"
                f"- Follow a step-by-step logical sequence.\n"
                f"- Include edge-case analysis.\n"
                f"```\n\n"
                f"💡 *Running in Demo Mode. Set your API key with `/key <gsk_...>` for live LPU generation!*"
            )
            words = demo_text.split(" ")
            accumulated = ""
            start = time.time()
            with Live(console=console, refresh_per_second=20) as live:
                for i, w in enumerate(words):
                    chunk = w if i == 0 else " " + w
                    accumulated += chunk
                    time.sleep(0.015)
                    live.update(Markdown(accumulated))
            
            elapsed = time.time() - start
            console.print(f"\n[dim]⚡ [yellow]{round(len(words)/elapsed, 1)} tok/s[/yellow] • {round(elapsed, 2)}s • [yellow]DEMO[/yellow][/dim]\n")
            self.history.append({"role": "assistant", "content": demo_text})
            return

        accumulated = ""
        start = time.time()
        token_count = 0

        try:
            stream = self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                stream=True,
                temperature=0.6
            )

            with Live(console=console, refresh_per_second=24) as live:
                for chunk in stream:
                    if chunk.choices and len(chunk.choices) > 0:
                        content = chunk.choices[0].delta.content or ""
                        if content:
                            accumulated += content
                            token_count += 1
                            live.update(Markdown(accumulated))

            elapsed = time.time() - start
            speed = round(token_count / max(0.05, elapsed), 1)

            # Display in clean Master Prompt panel if not a casual reply
            is_casual = len(accumulated.strip()) < 200 and any(w in accumulated.lower() for w in ["welcome", "hello", "hi", "no problem", "glad to help"])
            if not is_casual:
                console.print(Panel(
                    Markdown(accumulated.strip()),
                    title="[bold yellow]🎯 MASTER PROMPT // VR DEVELOPMENTS[/bold yellow]",
                    subtitle="[dim green]Ready to copy into ChatGPT / Claude / Cursor / v0[/dim green]",
                    border_style="cyan"
                ))

            console.print(f"\n[dim]⚡ [bold yellow]{speed} tok/s[/bold yellow] • [bold cyan]{token_count} tokens[/bold cyan] • {round(elapsed, 2)}s[/dim]\n")
            self.history.append({"role": "assistant", "content": accumulated})

        except KeyboardInterrupt:
            console.print("\n[yellow][Prompt generation stopped][/yellow]\n")
        except Exception as e:
            console.print(f"\n[bold red]✖ Error: {e}[/bold red]\n")

    def run(self):
        self.print_banner()

        while True:
            try:
                user_input = console.input("[bold cyan]💡 Enter Topic / Idea ❯[/bold cyan] ").strip()

                if not user_input:
                    continue

                if user_input.startswith("/"):
                    continue_loop = self.execute_command(user_input)
                    if not continue_loop:
                        break
                elif user_input.startswith("gsk_"):
                    self.set_key(user_input)
                else:
                    self.craft_prompt(user_input)

            except (KeyboardInterrupt, EOFError):
                console.print("\n[bold yellow]🎯 PromptCraft closed. Goodbye![/bold yellow]")
                break

def main():
    parser = argparse.ArgumentParser(description="PromptCraft by VR DEVELOPMENTS")
    parser.add_argument("--model", "-m", default="openai/gpt-oss-120b", help="Groq model ID")
    parser.add_argument("--key", "-k", default=None, help="Groq API Key")
    parser.add_argument("idea", nargs="*", help="Optional topic/idea to craft immediately")

    args = parser.parse_args()
    app = PromptCraftCLI(model=args.model, api_key=args.key)

    if args.idea:
        idea_text = " ".join(args.idea)
        app.craft_prompt(idea_text)
    else:
        app.run()

if __name__ == "__main__":
    main()
