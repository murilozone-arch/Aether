# Aether Project Setup Plan

Este plano descreve o design de arquitetura, a estrutura de arquivos e as tarefas para transformar a base de código do **QwenPaw** no **Aether**.

## Decisões Definidas pelo Usuário
1. **Speech-to-Text (STT):** Google Speech Recognition nativo do navegador (via Web Speech API).
2. **Atualização do Canvas:** Websockets / Server-Sent Events (Real-time).
3. **Calibração de Voz (Biometria):** Onboarding Interativo com UI no console (gravação de 3 amostras, cálculo do footprint de voz e salvamento em LocalStorage).

## 4-Phase Roadmap

### Phase 1: Clonagem e Configuração do Ambiente [Foundation]
- [ ] Clonar o repositório original do QwenPaw para a pasta local `aether-core`.
- [ ] Ajustar `pyproject.toml` no backend para relaxar as restrições de dependências do Python local.
- [ ] Criar ambiente virtual e instalar dependências de backend em modo editável (`pip install -e .`).
- [ ] Inicializar configuração do QwenPaw (`qwenpaw init --defaults --accept-security --force`).

### Phase 2: Redesenho de Identidade Visual e CSS (Estética Azul Flat)
- [ ] Substituir o token `colorPrimary` do Ant Design de laranja (`#ff7f16`) para azul premium (`#1677ff`) em `console/src/App.tsx`.
- [ ] Substituir todas as instâncias da cor laranja original por `#1677ff` em `console/src/styles/layout.css` e outros arquivos de estilos.
- [ ] Remover animações holográficas, scanlines e brilhos de neon, adotando fundos e bordas sólidas.

### Phase 3: Layout Dividido (Chat + Canvas)
- [ ] Implementar visualização dividida em `console/src/pages/Chat/index.tsx`:
  - Esquerda: Conversa (`<AgentScopeRuntimeWebUI />`).
  - Divisor vertical ajustável (Draggable Resizer).
  - Direita: Novo painel do canvas (`<AetherCanvas />`).
- [ ] Remover abas antigas de HUD e navegação legada.

### Phase 4: Pipeline de Voz, WakeWord e Onboarding de Biometria
- [ ] Implementar `voiceService.ts` com:
  - Integração da **Web Speech API (Google STT)**.
  - Detector de WakeWord local via `openwakeword-wasm-browser` (carregando `.onnx` dinamicamente).
  - Comparação de similaridade de cosseno de embeddings usando `@jaehyun-ko/speaker-verification` com o `speakerFootprint` do `localStorage`.
- [ ] Criar componente `VoiceOnboarding.tsx` para calibração interativa de voz (gravação de 3 amostras e cálculo de vetor médio).
- [ ] Atualizar painel de configurações para controle de WakeWord, limiar de similaridade e acionamento de calibração.

### Phase 5: Canvas Dinâmico e WebSocket Backend
- [ ] Adicionar suporte a WebSockets no backend FastAPI (`/ws/canvas`) para transmissão de comandos de atualização de UI em tempo real.
- [ ] Criar a Skill `canvas_writer.py` em Python para gravar alterações em `public/modules/canvas.html` e disparar o broadcast WebSocket.
- [ ] Criar o componente frontend `<AetherCanvas />` conectando-se ao WebSocket e renderizando o código dinâmico recebido em um iframe isolado com efeitos de transição.
- [ ] Sincronizar apresentações do MIRA Animator via eventos WebSocket.

---

## ✅ PHASE X COMPLETE
- Lint: [ ]
- Security: [ ]
- Build: [ ]
- Date: [ ]
