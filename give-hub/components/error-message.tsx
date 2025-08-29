'use client';

/**
 * Client component for displaying error messages with retry functionality
 */
export default function ErrorMessage({ message }: { message: string }) {
  return (
    <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-8 rounded shadow-sm">
      <div className="flex items-start">
        <div className="flex-shrink-0">
          <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
        </div>
        <div className="ml-3">
          <h3 className="text-sm font-medium text-red-800">Error loading campaigns</h3>
          <div className="mt-2 text-sm text-red-700">
            <p>{message}</p>
          </div>
          <div className="mt-4">
            <button 
              onClick={() => window.location.reload()} 
              className="text-sm font-medium text-red-600 hover:text-red-500"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
