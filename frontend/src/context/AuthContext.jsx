import { createContext, useContext, useEffect, useState } from 'react'
import authService from '../services/authService.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const savedUser = localStorage.getItem('medivault_user')
      return savedUser ? JSON.parse(savedUser) : null
    } catch {
      return null
    }
  })
  const [token, setToken] = useState(() => localStorage.getItem('medivault_token') || null)
  const [isLoading, setIsLoading] = useState(true)

  // Validate session on app initialization
  useEffect(() => {
    let isMounted = true

    async function checkAuth() {
      const storedToken = localStorage.getItem('medivault_token')
      if (!storedToken) {
        if (isMounted) {
          setUser(null)
          setToken(null)
          setIsLoading(false)
        }
        return
      }

      try {
        const currentUser = await authService.getCurrentUser()
        if (isMounted) {
          setUser(currentUser)
          setToken(storedToken)
          localStorage.setItem('medivault_user', JSON.stringify(currentUser))
        }
      } catch (err) {
        if (isMounted) {
          // Only invalidate token if backend explicitly rejected credentials (401)
          if (err.response?.status === 401) {
            localStorage.removeItem('medivault_token')
            localStorage.removeItem('medivault_user')
            setUser(null)
            setToken(null)
          } else {
            // Server offline or network issue: preserve cached user session
            console.warn('Backend server is temporarily unreachable during session check:', err.message)
          }
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    checkAuth()

    return () => {
      isMounted = false
    }
  }, [])

  /**
   * Log in user with credentials.
   */
  const login = async (email, password) => {
    const data = await authService.login({ email, password })
    localStorage.setItem('medivault_token', data.access_token)
    localStorage.setItem('medivault_user', JSON.stringify(data.user))
    setToken(data.access_token)
    setUser(data.user)
    return data
  }

  /**
   * Register a new user.
   */
  const register = async (registrationData) => {
    return await authService.register(registrationData)
  }

  /**
   * Log out user from current session.
   */
  const logout = async () => {
    try {
      await authService.logout()
    } finally {
      localStorage.removeItem('medivault_token')
      localStorage.removeItem('medivault_user')
      setUser(null)
      setToken(null)
    }
  }

  const value = {
    user,
    token,
    isAuthenticated: Boolean(token && user),
    isLoading,
    login,
    register,
    logout,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

export default AuthContext
