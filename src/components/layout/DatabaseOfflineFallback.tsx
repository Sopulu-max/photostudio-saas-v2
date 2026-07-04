import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export function DatabaseOfflineFallback({ 
  retryAction 
}: { 
  retryAction?: () => void 
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] p-6 text-center">
      <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-6">
        <AlertTriangle className="w-8 h-8 text-red-600" />
      </div>
      
      <h2 className="text-2xl font-serif text-gray-900 mb-2">
        Can't reach the studio's memory
      </h2>
      
      <p className="text-gray-500 max-w-md mb-8">
        The database is currently offline or unreachable. We cannot load live operational data right now. 
        Mocks are no longer silently used as a fallback in production.
      </p>

      {retryAction ? (
        <button 
          onClick={retryAction}
          className="flex items-center gap-2 px-6 py-3 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Try Again</span>
        </button>
      ) : (
        <button 
          onClick={() => window.location.reload()}
          className="flex items-center gap-2 px-6 py-3 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Refresh Page</span>
        </button>
      )}
    </div>
  );
}
