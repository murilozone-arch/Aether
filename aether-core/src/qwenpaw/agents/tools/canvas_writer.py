# -*- coding: utf-8 -*-
"""Tool for writing HTML/JS content to the dynamic Canvas and broadcasting it via WebSockets."""

import os
from pathlib import Path
import logging
from agentscope.message import TextBlock
from agentscope.tool import ToolResponse

logger = logging.getLogger(__name__)

async def canvas_writer(html_content: str) -> ToolResponse:
    """Write HTML5/JS code to the user's split-screen dynamic Canvas on the right side of the screen.

    Use this tool whenever you want to display data visually, render interactive components,
    or show presentations/slides (using standard HTML/CSS/JS or MIRA Animator decks) to support
    your chat responses. The console will render this page in real-time.

    Args:
        html_content (str): The complete HTML/CSS/JS code to write and display.
                            It should be self-contained and ready to render in an iframe.
    """
    try:
        # Import static directory and connection manager from FastAPI app
        from qwenpaw.app._app import _CONSOLE_STATIC_DIR, canvas_manager
        
        if not _CONSOLE_STATIC_DIR:
            return ToolResponse(
                content=[
                    TextBlock(
                        type="text",
                        text="Error: Console static directory is not resolved.",
                    )
                ]
            )
            
        static_path = Path(_CONSOLE_STATIC_DIR)
        modules_path = static_path / "modules"
        modules_path.mkdir(parents=True, exist_ok=True)
        
        canvas_file = modules_path / "canvas.html"
        
        # Write content to canvas.html
        canvas_file.write_text(html_content, encoding="utf-8")
        
        # Broadcast the new HTML content over WebSocket to all connected clients
        await canvas_manager.broadcast({
            "type": "update",
            "html": html_content,
            "url": "/modules/canvas.html"
        })
        
        return ToolResponse(
            content=[
                TextBlock(
                    type="text",
                    text="Successfully updated Canvas in real-time.",
                )
            ]
        )
    except Exception as e:
        logger.exception("Failed to write to Canvas: %s", str(e))
        return ToolResponse(
            content=[
                TextBlock(
                    type="text",
                    text=f"Error writing to Canvas: {str(e)}",
                )
            ]
        )
