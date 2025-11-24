# Dev Server 404 Errors - Known Issue & Solution

## Problem
When making changes during development, you may see 404 errors in the browser console for Next.js static assets:
- `GET http://localhost:3000/_next/static/css/app/layout.css?v=... 404`
- `GET http://localhost:3000/_next/static/chunks/... 404`

## Cause
This is a known behavior with Next.js Hot Module Replacement (HMR). When files change:
1. The browser requests new assets with updated version numbers
2. The dev server is still compiling/rebuilding
3. Assets aren't ready yet, causing temporary 404s

## Solution Implemented

### 1. Improved Webpack Configuration
- Added better watch options for file changes
- Increased buffer sizes for page caching
- Better error handling for missing modules

### 2. Asset Error Handler
- Client-side component that suppresses known HMR 404 errors
- Prevents console spam during development
- Only active in development mode

### 3. Favicon Support
- Added favicon via metadata API
- Uses the AnyGym logo from Cloudinary

## How to Minimize These Errors

1. **Wait for compilation**: After making changes, wait 2-3 seconds before refreshing
2. **Hard refresh**: Use `Cmd+Shift+R` (Mac) or `Ctrl+Shift+R` (Windows) to clear cache
3. **Restart dev server**: If errors persist, restart with `npm run dev`

## Note
These errors are **cosmetic** and don't affect functionality. The AssetErrorHandler component suppresses them in the console, but they may still appear briefly in the Network tab during HMR.

