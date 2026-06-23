# -*- coding: utf-8 -*-
"""Tool for generating premium Flat Blue HTML5 slide presentations for the Aether Canvas."""

import os
from pathlib import Path
import logging
import json
from agentscope.message import TextBlock
from agentscope.tool import ToolResponse

logger = logging.getLogger(__name__)

async def create_presentation(title: str, slides: list, theme: str = "flat-blue") -> ToolResponse:
    """Create a beautiful, interactive slide presentation on the Aether Canvas.

    Use this tool to display structured reports, slide decks, pitches, or project overviews.
    The tool automatically formats the content into a modern, responsive HTML5 
    presentation deck with keyboard navigation and slide transition effects.

    Args:
        title (str): The main title of the presentation.
        slides (list[dict]): A list of slide objects. Each slide dict must contain:
                             - "title" (str): Title of the slide.
                             - "type" (str): Slide layout type. Options: "cover", "bullets", "text", "comparison", "conclusion", "3d".
                             - "content" (list[str] or str): The text content or list of bullet points.
                             - "extra" (dict, optional): Additional options like:
                                 - "subtitle" (str) for cover slides.
                                 - "left_title", "right_title" (str) for comparison layouts.
                                 - "model_src" / "src" (str), "model_alt" / "alt" (str), "layout" (str - "model-right", "model-left", "model-full", "model-top"), "camera_orbit" (str), "camera_target" (str), "field_of_view" (str), "auto_rotate" (bool), "camera_controls" (bool), "shadow_intensity" (float), "exposure" (float), "animation_name" (str), "bg_color" (str) for 3d layout.
                                 - "transition" (str - "zoom", "fade", "slide-h", "slide-v", "flip3d") for transition style.
        theme (str, optional): The style theme of the presentation. Options: "flat-blue" (default) or "mira-animator".
    """
    try:
        # Generate the HTML content from template
        html_content = _generate_presentation_html(title, slides, theme)
        
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
            "tab": "slides",
            "html": html_content,
            "url": "/modules/canvas.html"
        })
        
        return ToolResponse(
            content=[
                TextBlock(
                    type="text",
                    text=f"Successfully generated presentation '{title}' with {len(slides)} slides on the Canvas.",
                )
            ]
        )
    except Exception as e:
        logger.exception("Failed to create presentation: %s", str(e))
        return ToolResponse(
            content=[
                TextBlock(
                    type="text",
                    text=f"Error creating presentation: {str(e)}",
                )
            ]
        )


def _generate_presentation_html(title: str, slides: list, theme: str = "flat-blue") -> str:
    """Generate the full HTML string for the slideshow."""
    
    # Build slides HTML
    slides_html = ""
    for idx, slide in enumerate(slides):
        active_class = "active" if idx == 0 else ""
        slide_title = slide.get("title", "")
        slide_type = slide.get("type", "text")
        slide_content = slide.get("content", "")
        extra = slide.get("extra") or {}
        
        # Slide-specific transition (defaulting to "zoom" to feel premium)
        slide_transition = extra.get("transition") or "zoom"
        transition_class = f"transition-{slide_transition}"
        
        content_html = ""
        
        if slide_type == "cover":
            subtitle = extra.get("subtitle", "")
            content_html = f"""
            <div class="slide-cover">
                <div class="logo-badge">AETHER</div>
                <h1 class="cover-title">{slide_title}</h1>
                {f'<p class="cover-subtitle">{subtitle}</p>' if subtitle else ''}
                <div class="cover-decor"></div>
            </div>
            """
        elif slide_type == "bullets":
            bullets = slide_content if isinstance(slide_content, list) else [slide_content]
            bullets_li = "".join(f'<li style="--delay: {i*0.1}s">{bullet}</li>' for i, bullet in enumerate(bullets))
            content_html = f"""
            <div class="slide-header">
                <h2>{slide_title}</h2>
                <div class="title-bar"></div>
            </div>
            <div class="slide-content">
                <ul class="bullet-list">
                    {bullets_li}
                </ul>
            </div>
            """
        elif slide_type == "comparison":
            left_title = extra.get("left_title", "Concept A")
            right_title = extra.get("right_title", "Concept B")
            
            # If content is a dict or list, parse it
            left_content = ""
            right_content = ""
            
            if isinstance(slide_content, dict):
                left_val = slide_content.get("left", "")
                right_val = slide_content.get("right", "")
            elif isinstance(slide_content, list) and len(slide_content) >= 2:
                left_val = slide_content[0]
                right_val = slide_content[1]
            else:
                left_val = slide_content
                right_val = ""
                
            left_items = "".join(f"<li>{x}</li>" for x in left_val) if isinstance(left_val, list) else f"<p>{left_val}</p>"
            right_items = "".join(f"<li>{x}</li>" for x in right_val) if isinstance(right_val, list) else f"<p>{right_val}</p>"
            
            content_html = f"""
            <div class="slide-header">
                <h2>{slide_title}</h2>
                <div class="title-bar"></div>
            </div>
            <div class="slide-content compare-layout">
                <div class="compare-col left-col">
                    <h3>{left_title}</h3>
                    <div class="col-content">{left_items}</div>
                </div>
                <div class="compare-col right-col">
                    <h3>{right_title}</h3>
                    <div class="col-content">{right_items}</div>
                </div>
            </div>
            """
        elif slide_type == "conclusion":
            bullets = slide_content if isinstance(slide_content, list) else [slide_content]
            bullets_li = "".join(f'<li>{bullet}</li>' for bullet in bullets)
            content_html = f"""
            <div class="slide-cover slide-conclusion">
                <h1 class="conclusion-title">{slide_title}</h1>
                <div class="conclusion-content">
                    {f'<ul class="conclusion-list">{bullets_li}</ul>' if isinstance(slide_content, list) else f'<p class="conclusion-text">{slide_content}</p>'}
                </div>
                <div class="logo-badge" style="margin-top: 40px;">AETHER STATION</div>
            </div>
            """
        elif slide_type == "3d":
            model_src = extra.get("model_src") or extra.get("src") or "https://modelviewer.dev/shared-assets/models/Astronaut.glb"
            model_alt = extra.get("model_alt") or extra.get("alt") or "Objeto 3D interativo"
            layout = extra.get("layout") or "model-right"  # Options: model-right, model-left, model-full, model-top
            camera_orbit = extra.get("camera_orbit") or ""
            camera_target = extra.get("camera_target") or ""
            field_of_view = extra.get("field_of_view") or ""
            auto_rotate = "auto-rotate" if extra.get("auto_rotate", True) else ""
            camera_controls = "camera-controls" if extra.get("camera_controls", True) else ""
            shadow_intensity = str(extra.get("shadow_intensity", 1))
            exposure = str(extra.get("exposure", 1))
            animation_name = extra.get("animation_name") or ""
            skybox_image = extra.get("skybox_image") or ""
            environment_image = extra.get("environment_image") or ""
            bg_color = extra.get("bg_color") or ""
            
            # Build attributes for model-viewer
            mv_attrs = []
            if camera_orbit: mv_attrs.append(f'camera-orbit="{camera_orbit}"')
            if camera_target: mv_attrs.append(f'camera-target="{camera_target}"')
            if field_of_view: mv_attrs.append(f'field-of-view="{field_of_view}"')
            if auto_rotate: mv_attrs.append(auto_rotate)
            if camera_controls: mv_attrs.append(camera_controls)
            if shadow_intensity: mv_attrs.append(f'shadow-intensity="{shadow_intensity}"')
            if exposure: mv_attrs.append(f'exposure="{exposure}"')
            if animation_name: mv_attrs.append(f'animation-name="{animation_name}" autoplay')
            if skybox_image: mv_attrs.append(f'skybox-image="{skybox_image}"')
            if environment_image: mv_attrs.append(f'environment-image="{environment_image}"')
            
            mv_attrs_str = " ".join(mv_attrs)
            
            # Layout style
            model_style = "width: 100%; height: 100%; min-height: 250px; outline: none; background-color: transparent;"
            container_style = f"background: {bg_color};" if bg_color else ""
            
            model_viewer_html = f"""
            <model-viewer 
                src="{model_src}" 
                alt="{model_alt}"
                {mv_attrs_str}
                style="{model_style}"
            >
            </model-viewer>
            """
            
            if layout == "model-full":
                # Fullscreen model with glassmorphic text box overlay
                content_html = f"""
                <div class="model-full-container" style="position: absolute; top:0; left:0; width:100%; height:100%; z-index: 1; {container_style}">
                    {model_viewer_html}
                </div>
                <div class="model-full-overlay" style="position: absolute; bottom: 40px; left: 40px; right: 40px; z-index: 2; border-radius: 12px; padding: 24px; text-align: left; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.08);">
                    <h2 style="font-size: 1.5rem; margin-bottom: 8px; color: var(--text-dark);">{slide_title}</h2>
                    <div class="model-description" style="font-size: 14px; line-height: 1.5; color: var(--text-muted);">
                        {slide_content}
                    </div>
                </div>
                """
            elif layout == "model-left":
                content_html = f"""
                <div class="slide-header">
                    <h2>{slide_title}</h2>
                    <div class="title-bar"></div>
                </div>
                <div class="slide-content model-3d-layout" style="display: flex; gap: 40px; align-items: center; height: calc(100% - 60px); padding: 20px;">
                    <div class="model-container" style="flex: 1.2; height: 100%; border: 1px solid var(--border-color); border-radius: 8px; background: #fafafa; overflow: hidden; display: flex; align-items: center; justify-content: center; {container_style}">
                        {model_viewer_html}
                    </div>
                    <div class="model-description" style="flex: 1; font-size: 16px; line-height: 1.6; color: var(--text-dark); text-align: left;">
                        {slide_content}
                    </div>
                </div>
                """
            elif layout == "model-top":
                content_html = f"""
                <div class="slide-header" style="margin-bottom: 12px;">
                    <h2>{slide_title}</h2>
                    <div class="title-bar" style="margin-bottom: 12px;"></div>
                </div>
                <div class="slide-content model-3d-layout-vertical" style="display: flex; flex-direction: column; gap: 16px; height: calc(100% - 50px); padding: 10px 0;">
                    <div class="model-container" style="flex: 1.5; width: 100%; border: 1px solid var(--border-color); border-radius: 8px; background: #fafafa; overflow: hidden; display: flex; align-items: center; justify-content: center; {container_style}">
                        {model_viewer_html}
                    </div>
                    <div class="model-description" style="flex: 1; font-size: 14px; line-height: 1.5; color: var(--text-dark); text-align: left; overflow-y: auto;">
                        {slide_content}
                    </div>
                </div>
                """
            else: # model-right
                content_html = f"""
                <div class="slide-header">
                    <h2>{slide_title}</h2>
                    <div class="title-bar"></div>
                </div>
                <div class="slide-content model-3d-layout" style="display: flex; gap: 40px; align-items: center; height: calc(100% - 60px); padding: 20px;">
                    <div class="model-description" style="flex: 1; font-size: 16px; line-height: 1.6; color: var(--text-dark); text-align: left;">
                        {slide_content}
                    </div>
                    <div class="model-container" style="flex: 1.2; height: 100%; border: 1px solid var(--border-color); border-radius: 8px; background: #fafafa; overflow: hidden; display: flex; align-items: center; justify-content: center; {container_style}">
                        {model_viewer_html}
                    </div>
                </div>
                """
        else:  # standard text layout
            paragraphs = slide_content if isinstance(slide_content, list) else [slide_content]
            para_html = "".join(f'<p>{p}</p>' for p in paragraphs)
            content_html = f"""
            <div class="slide-header">
                <h2>{slide_title}</h2>
                <div class="title-bar"></div>
            </div>
            <div class="slide-content text-content">
                {para_html}
            </div>
            """
            
        slides_html += f"""
        <div class="slide {active_class} {transition_class}" id="slide-{idx}">
            <div class="slide-inner">
                {content_html}
            </div>
        </div>
        """
        
    # Navigation dots
    dots_html = "".join(f'<div class="dot {"active" if i==0 else ""}" onclick="goToSlide({i})"></div>' for i in range(len(slides)))

    # Main template
    full_html = f"""<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{title}</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&family=Outfit:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <script type="module" src="https://ajax.googleapis.com/ajax/libs/model-viewer/4.0.0/model-viewer.min.js"></script>
    <style>
        :root {{
            --font-display: 'Outfit', sans-serif;
            --font-body: 'Inter', sans-serif;
        }}

        /* Default Flat Blue Theme */
        body.theme-flat-blue {{
            --primary: #1677ff;
            --primary-bg: #e6f4ff;
            --text-dark: #1f1f1f;
            --text-muted: #595959;
            --bg-light: #f5f5f5;
            --card-bg: #ffffff;
            --border-color: #f0f0f0;
        }}

        /* MIRA Animator Theme (Charcoal Slate & Ice Blue/Teal accents) */
        body.theme-mira-animator {{
            --primary: #0ea5e9;
            --primary-bg: rgba(14, 165, 233, 0.15);
            --text-dark: #f8fafc;
            --text-muted: #94a3b8;
            --bg-light: #0f172a;
            --card-bg: #1e293b;
            --border-color: #334155;
        }}
        body.theme-mira-animator .slide {{
            background-color: #0f172a;
        }}
        body.theme-mira-animator .model-container {{
            background-color: #0f172a !important;
            border-color: #334155 !important;
        }}
        body.theme-mira-animator .compare-col {{
            background-color: #1b2537 !important;
            border-color: #334155 !important;
        }}
        body.theme-mira-animator .model-full-overlay {{
            background: rgba(30, 41, 59, 0.85) !important;
            backdrop-filter: blur(12px);
            border-color: rgba(255, 255, 255, 0.1) !important;
        }}
        body.theme-mira-animator .btn {{
            background-color: #1e293b;
            border-color: #334155;
            color: #94a3b8;
        }}
        body.theme-mira-animator .btn:hover {{
            background-color: rgba(14, 165, 233, 0.15);
            color: #0ea5e9;
            border-color: #0ea5e9;
        }}

        /* Aether Theme (Cosmic Slate-Purple & Radiant Cyan-Blue accents) */
        body.theme-aether {{
            --primary: #38bdf8;
            --primary-bg: rgba(56, 189, 248, 0.15);
            --text-dark: #f8fafc;
            --text-muted: #cbd5e1;
            --bg-light: #0f172a;
            --card-bg: rgba(15, 23, 42, 0.55);
            --border-color: rgba(255, 255, 255, 0.08);
            --accent-glow: 0 0 20px rgba(56, 189, 248, 0.25);
        }}
        body.theme-aether {{
            background: radial-gradient(circle at top, #1e1b4b, #0f172a) !important;
        }}
        body.theme-aether .deck-container {{
            background: transparent !important;
        }}
        body.theme-aether .slide {{
            background: transparent !important;
        }}
        body.theme-aether .slide-inner {{
            background: rgba(30, 41, 59, 0.55) !important;
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            border: 1px solid rgba(255, 255, 255, 0.1) !important;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.05) !important;
        }}
        body.theme-aether .model-container {{
            background-color: rgba(15, 23, 42, 0.4) !important;
            border-color: rgba(255, 255, 255, 0.1) !important;
        }}
        body.theme-aether .compare-col {{
            background-color: rgba(30, 41, 59, 0.3) !important;
            border-color: rgba(255, 255, 255, 0.08) !important;
        }}
        body.theme-aether .model-full-overlay {{
            background: rgba(15, 23, 42, 0.75) !important;
            backdrop-filter: blur(16px);
            border-color: rgba(255, 255, 255, 0.1) !important;
        }}
        body.theme-aether .title-bar {{
            background: linear-gradient(90deg, #38bdf8, #818cf8) !important;
            box-shadow: var(--accent-glow);
        }}
        body.theme-aether .logo-badge {{
            background: linear-gradient(135deg, rgba(56, 189, 248, 0.2), rgba(129, 140, 248, 0.2)) !important;
            color: #38bdf8 !important;
            border: 1px solid rgba(56, 189, 248, 0.3) !important;
            box-shadow: var(--accent-glow);
        }}
        body.theme-aether .btn {{
            background-color: rgba(30, 41, 59, 0.5) !important;
            border-color: rgba(255, 255, 255, 0.1) !important;
            color: #cbd5e1 !important;
            backdrop-filter: blur(10px);
        }}
        body.theme-aether .btn:hover {{
            background-color: rgba(56, 189, 248, 0.15) !important;
            color: #38bdf8 !important;
            border-color: #38bdf8 !important;
            box-shadow: var(--accent-glow);
        }}
        body.theme-aether .bullet-list li::before {{
            color: #38bdf8 !important;
            text-shadow: var(--accent-glow);
        }}

        /* Glassmorphism for full model overlay in default theme */
        body.theme-flat-blue .model-full-overlay {{
            background: rgba(255, 255, 255, 0.75) !important;
            backdrop-filter: blur(12px);
            border-color: rgba(255, 255, 255, 0.4) !important;
        }}

        * {{
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }}

        body {{
            font-family: var(--font-body);
            background-color: var(--bg-light);
            color: var(--text-dark);
            height: 100vh;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            transition: background-color 0.3s;
        }}

        .deck-container {{
            position: relative;
            width: 100vw;
            height: 100vh;
            background-color: var(--bg-light);
            display: flex;
            justify-content: center;
            align-items: center;
        }}

        .slide {{
            position: absolute;
            width: 100%;
            height: 100%;
            opacity: 0;
            visibility: hidden;
            display: flex;
            justify-content: center;
            align-items: center;
            background-color: #fafafa;
            transition: opacity 0.6s cubic-bezier(0.4, 0, 0.2, 1), transform 0.6s cubic-bezier(0.4, 0, 0.2, 1), visibility 0.6s;
        }}

        .slide.active {{
            opacity: 1;
            visibility: visible;
            z-index: 10;
        }}

        /* Slide transition animations */
        .slide.transition-zoom {{
            transform: scale(0.85) translateY(15px);
        }}
        .slide.transition-zoom.active {{
            transform: scale(1) translateY(0);
        }}

        .slide.transition-fade {{
            transform: none;
        }}
        .slide.transition-fade.active {{
            transform: none;
        }}

        .slide.transition-slide-h {{
            transform: translateX(100%);
        }}
        .slide.transition-slide-h.active {{
            transform: translateX(0);
        }}

        .slide.transition-slide-v {{
            transform: translateY(100%);
        }}
        .slide.transition-slide-v.active {{
            transform: translateY(0);
        }}

        .slide.transition-flip3d {{
            transform: rotateY(90deg);
            transform-origin: center left;
            backface-visibility: hidden;
        }}
        .slide.transition-flip3d.active {{
            transform: rotateY(0deg);
        }}

        .slide-inner {{
            width: 90%;
            max-width: 800px;
            height: 85%;
            background-color: var(--card-bg);
            border-radius: 16px;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.04), 0 2px 8px rgba(0, 0, 0, 0.02);
            padding: 40px;
            display: flex;
            flex-direction: column;
            position: relative;
            overflow-y: auto;
            border: 1px solid var(--border-color);
            transition: background-color 0.3s, border-color 0.3s;
        }}

        /* Typography & Layouts */
        h2 {{
            font-family: var(--font-display);
            font-size: 2rem;
            font-weight: 700;
            color: var(--text-dark);
            margin-bottom: 8px;
        }}

        .title-bar {{
            width: 60px;
            height: 4px;
            background-color: var(--primary);
            border-radius: 2px;
            margin-bottom: 24px;
        }}

        .slide-content {{
            flex: 1;
            display: flex;
            flex-direction: column;
            justify-content: center;
        }}

        /* Bullets layout */
        .bullet-list {{
            list-style: none;
        }}

        .bullet-list li {{
            font-size: 1.15rem;
            line-height: 1.6;
            margin-bottom: 16px;
            padding-left: 28px;
            position: relative;
            opacity: 0;
            transform: translateY(10px);
            animation: slideUpIn 0.5s forwards;
            animation-delay: var(--delay, 0s);
            color: var(--text-dark);
        }}

        .bullet-list li::before {{
            content: "→";
            position: absolute;
            left: 0;
            top: 0;
            color: var(--primary);
            font-weight: bold;
        }}

        /* Cover slide */
        .slide-cover {{
            height: 100%;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            text-align: center;
            position: relative;
        }}

        .cover-title {{
            font-family: var(--font-display);
            font-size: 3rem;
            font-weight: 800;
            line-height: 1.15;
            color: var(--text-dark);
            margin-bottom: 16px;
        }}

        .cover-subtitle {{
            font-size: 1.25rem;
            color: var(--text-muted);
            max-width: 600px;
        }}

        .logo-badge {{
            background-color: var(--primary-bg);
            color: var(--primary);
            padding: 6px 16px;
            border-radius: 20px;
            font-size: 0.8rem;
            font-family: var(--font-display);
            font-weight: 700;
            letter-spacing: 1.5px;
            margin-bottom: 24px;
        }}

        .cover-decor {{
            position: absolute;
            bottom: -20px;
            width: 120px;
            height: 6px;
            background: linear-gradient(90deg, var(--primary), transparent);
            border-radius: 3px;
        }}

        /* Comparison layout */
        .compare-layout {{
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 32px;
            align-items: start;
        }}

        .compare-col {{
            background-color: #fafafa;
            border-radius: 12px;
            padding: 24px;
            border: 1px solid var(--border-color);
            height: 100%;
        }}

        .compare-col h3 {{
            font-family: var(--font-display);
            font-size: 1.25rem;
            margin-bottom: 16px;
            color: var(--primary);
        }}

        .compare-col li {{
            list-style: none;
            margin-bottom: 10px;
            font-size: 1rem;
            line-height: 1.5;
            position: relative;
            padding-left: 20px;
            color: var(--text-dark);
        }}

        .compare-col li::before {{
            content: "•";
            position: absolute;
            left: 0;
            color: var(--primary);
            font-weight: bold;
        }}

        /* Conclusion list */
        .conclusion-title {{
            font-family: var(--font-display);
            font-size: 2.5rem;
            font-weight: 700;
            color: var(--text-dark);
            margin-bottom: 24px;
        }}

        .conclusion-list {{
            list-style: none;
            text-align: left;
        }}

        .conclusion-list li {{
            font-size: 1.2rem;
            margin-bottom: 12px;
            padding-left: 24px;
            position: relative;
            color: var(--text-dark);
        }}

        .conclusion-list li::before {{
            content: "✓";
            position: absolute;
            left: 0;
            color: #52c41a;
            font-weight: bold;
        }}

        /* Text layout */
        .text-content p {{
            font-size: 1.15rem;
            line-height: 1.7;
            margin-bottom: 16px;
            color: var(--text-dark);
        }}

        /* Controls */
        .controls {{
            position: absolute;
            bottom: 24px;
            display: flex;
            align-items: center;
            gap: 20px;
            z-index: 100;
        }}

        .btn {{
            width: 40px;
            height: 40px;
            border-radius: 50%;
            border: 1px solid var(--border-color);
            background-color: var(--card-bg);
            cursor: pointer;
            display: flex;
            justify-content: center;
            align-items: center;
            font-weight: bold;
            font-size: 1rem;
            color: var(--text-muted);
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
            transition: all 0.3s;
        }}

        .btn:hover {{
            background-color: var(--primary-bg);
            color: var(--primary);
            border-color: var(--primary);
        }}

        .dots {{
            display: flex;
            gap: 8px;
        }}

        .dot {{
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background-color: #d9d9d9;
            cursor: pointer;
            transition: all 0.3s;
        }}

        .dot.active {{
            background-color: var(--primary);
            width: 20px;
            border-radius: 4px;
        }}

        /* Keyframes */
        @keyframes slideUpIn {{
            to {{
                opacity: 1;
                transform: translateY(0);
            }}
        }}

        @media (max-width: 600px) {{
            .slide-inner {{
                padding: 24px;
            }}
            .cover-title {{
                font-size: 2.2rem;
            }}
            .compare-layout {{
                grid-template-columns: 1fr;
                gap: 16px;
            }}
        }}
    </style>
</head>
<body class="theme-{theme}">
    <div class="deck-container">
        {slides_html}
        
        <div class="controls">
            <button class="btn" onclick="prevSlide()">&larr;</button>
            <div class="dots">
                {dots_html}
            </div>
            <button class="btn" onclick="nextSlide()">&rarr;</button>
        </div>
    </div>

    <script>
        let currentSlideIdx = 0;
        const totalSlides = {len(slides)};

        function showSlide(idx) {{
            if (idx < 0 || idx >= totalSlides) return;
            
            // Remove active classes
            document.querySelectorAll('.slide').forEach(s => s.classList.remove('active'));
            document.querySelectorAll('.dot').forEach(d => d.classList.remove('active'));
            
            // Set active
            document.getElementById('slide-' + idx).classList.add('active');
            document.querySelectorAll('.dot')[idx].classList.add('active');
            currentSlideIdx = idx;
        }}

        function nextSlide() {{
            if (currentSlideIdx < totalSlides - 1) {{
                showSlide(currentSlideIdx + 1);
            }}
        }}

        function prevSlide() {{
            if (currentSlideIdx > 0) {{
                showSlide(currentSlideIdx - 1);
            }}
        }}

        function goToSlide(idx) {{
            showSlide(idx);
        }}

        // Keyboard navigation
        document.addEventListener('keydown', (e) => {{
            if (e.key === 'ArrowRight' || e.key === ' ') {{
                nextSlide();
            }} else if (e.key === 'ArrowLeft') {{
                prevSlide();
            }}
        }});
    </script>
</body>
</html>
"""
    return full_html
