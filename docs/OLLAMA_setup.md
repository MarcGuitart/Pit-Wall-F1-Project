# Ollama Setup — Pit Wall IQ Engineer Chat

## Install

curl -fsSL https://ollama.ai/install.sh | sh

## Pull model

ollama pull llama3.1:8b

# Alternatives by hardware:
# High-end GPU:  ollama pull llama3.1:70b
# Mid-range:     ollama pull llama3.1:8b  (default)
# Low-resource:  ollama pull phi3:mini

## Start server

ollama serve
# Runs on http://localhost:11434

## Test

curl http://localhost:11434/api/chat -d '{
  "model": "llama3.1:8b",
  "messages": [{"role": "user", "content": "Say OK"}],
  "stream": false
}'

## Provider switching

Ollama exposes an OpenAI-compatible endpoint at:
  http://localhost:11434/v1/chat/completions

To switch to OpenAI or any other provider later,
change OLLAMA_URL in backend/.env and update the
client to use the provider's base URL + API key.
No other code changes needed.

## Context budget

The chat_service.build_chat_context() function outputs
~800 tokens of compact JSON. llama3.1:8b handles this
well with temperature=0.3 and num_predict=200.

Do NOT send raw OpenF1 arrays to the model.
The context builder is the critical filter.