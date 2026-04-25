import { useState, useCallback } from 'react';

export function useToast() {
  const [toast, setToast] = useState({ message: "", type: "" });

  const showToast = useCallback((message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast({ message: "", type: "" }), 3000);
  }, []);

  return { toast, showToast };
}
