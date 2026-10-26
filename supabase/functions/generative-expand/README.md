# Adobe Firefly Generative Expand

This function keeps Adobe credentials on the server and accepts requests only from signed-in Supabase users.

## Requirements

- Adobe Developer Console project with an active Enterprise contract that includes Firefly Services.
- OAuth Server-to-Server credentials for Firefly Services (Client ID and Client Secret).
- Supabase Edge Functions enabled for the project.

A standard Photoshop desktop subscription alone does not provide the server API credentials.

## Configure and deploy

In Supabase Dashboard, open **Edge Functions → Secrets** and add:

- `ADOBE_FIREFLY_CLIENT_ID`
- `ADOBE_FIREFLY_CLIENT_SECRET`

Then deploy the function from this repository:

```sh
supabase functions deploy generative-expand --project-ref YOUR_PROJECT_REF
```

Keep the function's JWT verification enabled. Do not add Adobe secrets to `NEXT_PUBLIC_*` settings or commit them to the repository.

The browser sends the original image to this function after the user selects **Mở rộng bằng Adobe Firefly**. Adobe's temporary upload is expanded to the selected output ratio; the function returns the generated image for preview/download.
