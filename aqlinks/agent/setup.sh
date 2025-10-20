#!/bin/bash

echo "🚀 Setting up Voice Agent environment..."

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    echo "📦 Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
echo "🔧 Activating virtual environment..."
source venv/bin/activate

# Upgrade pip
echo "⬆️ Upgrading pip..."
pip install --upgrade pip

# Install dependencies
echo "📚 Installing dependencies..."
pip install -r requirements.txt

echo "✅ Setup complete!"
echo ""
echo "To run the agent:"
echo "  source venv/bin/activate"
echo "  python voice_agent.py"
echo ""
echo "To test connection:"
echo "  python test_connection.py"
