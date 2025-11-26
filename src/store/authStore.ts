import { create } from 'zustand'
import {
  type User,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  sendPasswordResetEmail,
  updateProfile
} from 'firebase/auth'
import { auth } from '@/lib/firebase'

interface AuthState {
  user: User | null
  loading: boolean
  error: string | null
  initialized: boolean

  // Actions
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, displayName?: string) => Promise<void>
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
  resetPassword: (email: string) => Promise<void>
  clearError: () => void
  initialize: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: false,
  error: null,
  initialized: false,

  initialize: () => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      set({ user, initialized: true, loading: false })
    })

    // Return cleanup function
    return unsubscribe
  },

  signIn: async (email: string, password: string) => {
    try {
      set({ loading: true, error: null })
      await signInWithEmailAndPassword(auth, email, password)
      set({ loading: false })
    } catch (error: any) {
      set({
        loading: false,
        error: getErrorMessage(error.code)
      })
      throw error
    }
  },

  signUp: async (email: string, password: string, displayName?: string) => {
    try {
      set({ loading: true, error: null })
      const userCredential = await createUserWithEmailAndPassword(auth, email, password)

      // Set display name if provided
      if (displayName && userCredential.user) {
        await updateProfile(userCredential.user, { displayName })
      }

      set({ loading: false })
    } catch (error: any) {
      set({
        loading: false,
        error: getErrorMessage(error.code)
      })
      throw error
    }
  },

  signInWithGoogle: async () => {
    try {
      set({ loading: true, error: null })
      const provider = new GoogleAuthProvider()
      await signInWithPopup(auth, provider)
      set({ loading: false })
    } catch (error: any) {
      set({
        loading: false,
        error: getErrorMessage(error.code)
      })
      throw error
    }
  },

  signOut: async () => {
    try {
      set({ loading: true, error: null })
      await firebaseSignOut(auth)
      set({ loading: false, user: null })
    } catch (error: any) {
      set({
        loading: false,
        error: getErrorMessage(error.code)
      })
      throw error
    }
  },

  resetPassword: async (email: string) => {
    try {
      set({ loading: true, error: null })
      await sendPasswordResetEmail(auth, email)
      set({ loading: false })
    } catch (error: any) {
      set({
        loading: false,
        error: getErrorMessage(error.code)
      })
      throw error
    }
  },

  clearError: () => {
    set({ error: null })
  },
}))

// Helper function to get user-friendly error messages
function getErrorMessage(errorCode: string): string {
  switch (errorCode) {
    case 'auth/user-not-found':
      return 'ユーザーが見つかりません'
    case 'auth/wrong-password':
      return 'パスワードが間違っています'
    case 'auth/email-already-in-use':
      return 'このメールアドレスは既に使用されています'
    case 'auth/weak-password':
      return 'パスワードは6文字以上にしてください'
    case 'auth/invalid-email':
      return 'メールアドレスの形式が正しくありません'
    case 'auth/operation-not-allowed':
      return 'この操作は許可されていません'
    case 'auth/popup-closed-by-user':
      return 'ログインがキャンセルされました'
    case 'auth/network-request-failed':
      return 'ネットワークエラーが発生しました'
    case 'auth/too-many-requests':
      return 'リクエストが多すぎます。しばらくしてから再試行してください'
    case 'auth/user-disabled':
      return 'このアカウントは無効化されています'
    case 'auth/invalid-credential':
      return '認証情報が正しくありません'
    default:
      return 'エラーが発生しました。もう一度お試しください'
  }
}

// Initialize auth state listener on app start
if (typeof window !== 'undefined') {
  useAuthStore.getState().initialize()
}
