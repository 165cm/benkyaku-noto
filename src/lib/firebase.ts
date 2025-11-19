import { initializeApp } from 'firebase/app'
import { getStorage } from 'firebase/storage'

const firebaseConfig = {
  apiKey: "AIzaSyC4AVnJnXd2W1mVV4FMBp_woc9pWujEDvc",
  authDomain: "benkyaku-noto.firebaseapp.com",
  projectId: "benkyaku-noto",
  storageBucket: "benkyaku-noto.firebasestorage.app",
  messagingSenderId: "77824886756",
  appId: "1:77824886756:web:166034ec316f2c254a69f1",
  measurementId: "G-5FL9JHQ169"
}

// Initialize Firebase
const app = initializeApp(firebaseConfig)

// Initialize Cloud Storage
export const storage = getStorage(app)

export default app
