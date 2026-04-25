# Firefox Extension Package

This folder is a Firefox-specific package for AMO desktop + Android submission.

## Key differences from `extension/`
- Uses `background.scripts` (Firefox) instead of `service_worker`.
- Includes `browser_specific_settings.gecko_android` for Firefox Android availability.

## Build ZIP for AMO upload
From repo root:

```
Compress-Archive -Path extension-firefox\* -DestinationPath extension-firefox.zip -Force
```

## Notes
- Do not include `.pem` files in this folder.
- If you change extension ID, update `browser_specific_settings.gecko.id` in `manifest.json`.
- If AMO requires data-collection declaration for your submission cycle, add
  `browser_specific_settings.gecko.data_collection_permissions` and ensure
  `strict_min_version` targets a Firefox version that supports it.
