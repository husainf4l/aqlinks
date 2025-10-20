/**
 * User ID Management
 * Generates and persists a unique user ID in localStorage
 * This prevents duplicate connections when a user opens multiple tabs or refreshes
 */

const USER_ID_KEY = 'aqlinks_user_id';

/**
 * Generate a UUID v4
 */
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Get or create a persistent user ID
 * The ID is stored in localStorage and persists across page refreshes
 */
export function getUserId(): string {
  if (typeof window === 'undefined') {
    // Server-side rendering - return a temporary ID
    return 'temp-' + generateUUID();
  }

  try {
    let userId = localStorage.getItem(USER_ID_KEY);
    
    if (!userId) {
      userId = generateUUID();
      localStorage.setItem(USER_ID_KEY, userId);
      console.log('🆔 Generated new user ID:', userId);
    } else {
      console.log('🆔 Retrieved existing user ID:', userId);
    }
    
    return userId;
  } catch (error) {
    // Fallback if localStorage is not available (private browsing, etc.)
    console.warn('⚠️ localStorage not available, using session ID');
    return 'session-' + generateUUID();
  }
}

/**
 * Clear the stored user ID (useful for testing or logout)
 */
export function clearUserId(): void {
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem(USER_ID_KEY);
      console.log('🗑️ Cleared user ID');
    } catch (error) {
      console.warn('⚠️ Failed to clear user ID:', error);
    }
  }
}

/**
 * Generate a new user ID (replaces the existing one)
 */
export function regenerateUserId(): string {
  clearUserId();
  return getUserId();
}
