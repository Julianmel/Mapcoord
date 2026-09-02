# Mapa de Coordenadas — Brainstorm de Design

## Três Abordagens Estilísticas

### 1. Cartográfico Técnico
**Intro:** Interface inspirada em ferramentas de cartografia profissional (GIS), com painéis laterais flutuantes, tipografia monoespaçada para dados e paleta de tons terrosos/neutros. Transmite precisão e funcionalidade.
**Probabilidade:** 0.04

### 2. Glassmorphism Explorer
**Intro:** Painel de entrada flutuante sobre o mapa com efeito de vidro fosco, gradientes sutis azul-celeste, ícones delicados e transições suaves. O mapa é o protagonista absoluto, a interface parece flutuar sobre ele.
**Probabilidade:** 0.07

### 3. Brutalismo Funcional
**Intro:** Bordas nítidas, tipografia pesada e condensada, alto contraste preto/branco com um único acento de cor vibrante. Layout assimétrico e "raw", sem arredondamentos excessivos. Foco total na utilidade.
**Probabilidade:** 0.03

---

## Abordagem Escolhida: Cartográfico Técnico

### Design Movement
Design inspirado em interfaces GIS (Geographic Information Systems) e painéis de navegação aeronáutica — funcional, informativo, sem excesso decorativo.

### Core Principles
1. **Dados em primeiro plano** — coordenadas e informações são tratadas como elementos visuais de destaque, não como texto secundário.
2. **Hierarquia visual clara** — o mapa domina a tela; a interface de entrada é compacta e não-ofuscante.
3. **Feedback imediato** — cada ação do usuário gera resposta visual clara (contador, highlight, animação de entrada).
4. **Minimalismo funcional** — sem elementos decorativos desnecessários; cada pixel serve um propósito.

### Color Philosophy
- **Base:** Fundo escuro `#0f172a` (slate-900) para reduzir fadiga visual e dar profundidade ao mapa.
- **Superfície:** Painéis em `#1e293b` (slate-800) com bordas sutis.
- **Acento primário:** Azul-turquesa `#06b6d4` (cyan-500) — cor associada a navegação e tecnologia.
- **Texto:** Cinza claro `#e2e8f0` (slate-200) para legibilidade sem contraste agressivo.
- **Sucesso/Erro:** Verde `#22c55e` e vermelho `#ef4444` para estados.

### Layout Paradigm
Layout split-screen: painel de entrada à esquerda (compacto, ~320px), mapa ocupando o restante. Em mobile, painel vira um drawer empilhado no topo. O mapa é sempre visível e dominante.

### Signature Elements
1. **Painel flutuante** com borda esquerda em acento turquesa, criando a sensação de "terminal de navegação".
2. **Contador de coordenadas** com animação numérica incremental.
3. **Linha de status** na base mostrando total de pontos e ação executada.

### Interaction Philosophy
Interações rápidas e diretas. Input com monospace para as coordenadas (sensação de terminal). Botões com feedback tátil (scale 0.97 no click). Painel responde com animação de entrada dos itens parseados.

### Animation
- Entrada do painel: fade-in + slide-up, 200ms ease-out.
- Marcadores no mapa: pop-in com scale 0.95→1, staggered 30ms.
- Botão ativo: scale 0.97, 160ms ease-out.
- Contador: transição de número suave.

### Typography System
- **Display:** "Space Grotesk" — geométrica, moderna, perfeita para números e títulos.
- **Body:** "Inter" — legível, neutra, para instruções e labels.
- **Monospace:** "JetBrains Mono" — para o campo de coordenadas, transmitindo precisão técnica.
- Hierarquia: Títulos em bold/semibold, labels em medium, coordenadas em monospace regular.

### Brand Essence
**"Precisão cartográfica ao alcance de um paste."** — Para profissionais e entusiastas que precisam visualizar coordenadas rapidamente sem burocracia.
**Personalidade:** Preciso, direto, confiável.

### Brand Voice
- Headlines curtas e diretas, sem floreios.
- CTAs com verbos de ação técnica.
- Exemplo: "Carregar no mapa" / "12 pontos plotados com sucesso"

### Wordmark & Logo
Símbolo geométrico: um círculo com um ponto central e linhas de latitude/longitude cruzadas (estilo mira/retículo cartográfico), em turquesa sobre fundo escuro.

### Signature Brand Color
**`#06b6d4` (Cyan-500)** — usado em bordas de destaque, botões primários, contadores e linhas de status.

## Style Decisions

- A cor primária de ação permanece o cyan `#06b6d4`; verde fica reservado a estados de sucesso e feedback confirmado.
- O painel lateral usa grupos de captura, dados e visualização com espaçamento próprio, controles que quebram linha e grades responsivas para evitar sobreposição.
- O mapa mantém um substrato cartográfico sutil, com grade, retículo e cruz de referência visíveis durante o carregamento ou quando a área estiver vazia.
- O conteúdo técnico de coordenadas prioriza quebra segura de texto e não pode ser ocultado por controles adjacentes.
