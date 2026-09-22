import numpy as np
from sklearn.linear_model import LinearRegression
from sklearn.preprocessing import MinMaxScaler
import logging
import sys
import json

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class PricePredictor:
    def __init__(self, model_type="linear_regression"):
        self.model_type = model_type

    def predict_price(self, historical_prices, days_ahead=7):
        if len(historical_prices) < 3:
            return {'error': 'Need at least 3 historical data points'}

        try:
            if self.model_type == "linear_regression":
                return self._predict_linear(historical_prices, days_ahead)
            else:
                return {'error': 'Unknown model type'}
        except Exception as e:
            return {'error': str(e)}

    def _predict_linear(self, prices, days_ahead):
        X = np.arange(len(prices)).reshape(-1, 1)
        y = np.array(prices).reshape(-1, 1)

        X_scaled = X / len(prices)
        y_scaler = MinMaxScaler()
        y_scaled = y_scaler.fit_transform(y)

        model = LinearRegression()
        model.fit(X_scaled, y_scaled)

        future_X = np.arange(len(prices), len(prices) + days_ahead).reshape(-1, 1)
        future_X_scaled = future_X / len(prices)
        future_y_scaled = model.predict(future_X_scaled)

        future_y = y_scaler.inverse_transform(future_y_scaled)
        predictions = future_y.flatten().tolist()

        current_price = prices[-1]
        avg_prediction = float(np.mean(predictions))
        trend = "📈 UP" if avg_prediction > current_price else "📉 DOWN"
        confidence = abs(model.score(X_scaled, y_scaled) * 100)

        return {
            "predictions": predictions,
            "trend": trend,
            "confidence": confidence,
            "current_price": current_price,
            "predicted_avg": avg_prediction,
            "change_percent": ((avg_prediction - current_price) / current_price * 100)
        }

# استقبال البيانات من Node.js
if __name__ == "__main__":
    data = sys.stdin.read()
    prices = json.loads(data)

    predictor = PricePredictor()
    result = predictor.predict_price(prices, days_ahead=7)

    print(json.dumps(result))
