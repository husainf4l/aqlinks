import Link from 'next/link';

export default function Dashboard() {
  return (
    <div className="min-h-screen  flex items-center justify-center">
      <div className="bg-white p-8 rounded-lg shadow">
        <h1 className="text-2xl font-bold text-gray-800 mb-4">Dashboard</h1>
        <Link href="/dashboard/playground">
          <button className="bg-blue-500 text-white px-6 py-3 rounded hover:bg-blue-600">
            Go to Playground
          </button>
        </Link>
      </div>
    </div>
  );
}