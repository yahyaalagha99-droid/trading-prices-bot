import express from 'express';
import cors from 'cors';
import { spawn } from 'child_process';

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.post('/predict', (req, res) => {
  const { prices } = req.body;

  if (!prices || !Array.isArray(prices)) {
    return res.status(400).json({ error: 'prices must be an array' });
  }

  // استخدام python أو python3 حسب البيئة المتاحة
  const pythonExecutable = process.platform === 'win32' ? 'python' : 'python3';
  const py = spawn(pythonExecutable, ['price_predictor.py']);

  let dataString = '';
  let errorString = '';

  // إرسال البيانات إلى سكريبت بايثون
  py.stdin.write(JSON.stringify(prices));
  py.stdin.end();

  py.stdout.on('data', (data) => {
    dataString += data.toString();
  });

  py.stderr.on('data', (data) => {
    errorString += data.toString();
  });

  py.on('close', (code) => {
    if (code !== 0) {
      console.error('Python script error output:', errorString);
      return res.status(500).json({ 
        error: 'Python script failed', 
        details: errorString.trim() 
      });
    }

    try {
      const result = JSON.parse(dataString);
      return res.json(result);
    } catch (e) {
      console.error('JSON Parse error:', dataString);
      return res.status(500).json({ 
        error: 'Python returned invalid JSON', 
        raw: dataString.trim() 
      });
    }
  });

  // معالجة خطأ فشل بدء العملية من الأساس
  py.on('error', (err) => {
    console.error('Failed to start Python process:', err);
    return res.status(500).json({ 
      error: 'Failed to execute prediction process' 
    });
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
