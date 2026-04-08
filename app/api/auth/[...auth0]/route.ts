import { handleAuth, handleLogin } from '@auth0/nextjs-auth0'

const auth0Route = handleAuth({
  login: handleLogin({
    returnTo: '/dashboard',
    authorizationParams: {
      screen_hint: 'login',
      prompt: 'login',
    },
  }),
})

export const GET = auth0Route
export const POST = auth0Route

