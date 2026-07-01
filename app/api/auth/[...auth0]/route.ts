import { handleAuth, handleLogin } from '@auth0/nextjs-auth0'

const auth0Route = handleAuth({
  login: handleLogin({
    returnTo: '/',
    authorizationParams: {
      screen_hint: 'login',
      prompt: 'login',
    },
  }),
  signup: handleLogin({
    returnTo: '/',
    authorizationParams: {
      screen_hint: 'signup',
    },
  }),
})

export const GET = auth0Route
export const POST = auth0Route

