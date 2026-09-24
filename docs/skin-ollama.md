# Ollama skin report provider

The server supports an explicit optional Ollama Cloud provider. OpenAI remains the
default; existing drafts retain their original consent provider and cannot be sent
to the other provider. Start a new draft with the displayed Ollama consent.

Server environment (never public browser configuration):

```text
SKIN_ADVISOR_PROVIDER=ollama
SKIN_ADVISOR_MODEL=qwen3.5:397b
SKIN_ADVISOR_ENABLED=true
OLLAMA_API_KEY=<secret from the deployment secret manager>
```

Keep the existing authorized approver configuration. On this Mac the key is in
Keychain service `venus-skin.ollama-api`, account `venus-skin`; the server does not
automatically read a personal Keychain or change production secrets.

The provider sends normalized selected photos plus minimized context, never the
whole client record. It uses the same strict assessment validator, human review
and audit trail as the existing provider. Invalid JSON or an invalid assessment
fails closed, without an automatic billable retry. Cloud schema prompting is not
treated as a guarantee of structured output.

This is a report provider, NOT the SAM segmentation runner. It does not deliver
validated lesion counts, pixel masks or biological measurements. Production has
not been switched. Real client photos require provider-specific consent.

References:
- https://docs.ollama.com/cloud
- https://docs.ollama.com/capabilities/vision
