"""
Module for predicting future prices using machine learning
"""
import numpy as np
from sklearn.linear_model import LinearRegression
from sklearn.preprocessing import MinMaxScaler
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Tuple
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class PricePredictor:
    """Predicts future prices based on historical data"""
    
    def __init__(self, model_type: str = "linear_regression"):
        """
        Initialize predictor
        
        Args:
            model_type: Type of prediction model ('linear_regression', 'moving_average')
        """
        self.model_type = model_type
        self.scaler = MinMaxScaler()
        self.models = {}
    
    def predict_price(self, historical_prices: List[float], days_ahead: int = 7) -> Dict:
        """
        Predict future prices
        
        Args:
            historical_prices: List of historical prices
            days_ahead: Number of days to predict ahead
        
        Returns:
            Dictionary with predictions and confidence
        """
        try:
            if len(historical_prices) < 3:
                return {'error': 'Need at least 3 historical data points'}
            
            if self.model_type == "linear_regression":
                return self._predict_linear(historical_prices, days_ahead)
            elif self.model_type == "moving_average":
                return self._predict_moving_average(historical_prices, days_ahead)
            else:
                return {'error': 'Unknown model type'}
        
        except Exception as e:
            logger.error(f"Error predicting price: {str(e)}")
            return {'error': str(e)}
    
    def _predict_linear(self, prices: List[float], days_ahead: int) -> Dict:
        """Linear regression based prediction"""
        try:
            # Prepare data
            X = np.arange(len(prices)).reshape(-1, 1)
            y = np.array(prices).reshape(-1, 1)
            
            # Normalize
            X_scaled = X / len(prices)
            y_scaler = MinMaxScaler()
            y_scaled = y_scaler.fit_transform(y)
            
            # Train model
            model = LinearRegression()
            model.fit(X_scaled, y_scaled)
            
            # Predict
            future_X = np.arange(len(prices), len(prices) + days_ahead).reshape(-1, 1)
            future_X_scaled = future_X / len(prices)
            future_y_scaled = model.predict(future_X_scaled)
            
            # Denormalize predictions
            future_y = y_scaler.inverse_transform(future_y_scaled)
            predictions = future_y.flatten().tolist()
            
            # Calculate trend
            current_price = prices[-1]
            avg_prediction = np.mean(predictions)
            trend = "📈 UP" if avg_prediction > current_price else "📉 DOWN"
            
            # Calculate confidence (R² score)
            confidence = min(100, max(0, abs(model.score(X_scaled, y_scaled) * 100)))
            
            return {
                'predictions': predictions,
                'trend': trend,
                'confidence': confidence,
                'current_price': current_price,
                'predicted_avg': avg_prediction,
                'change_percent': ((avg_prediction - current_price) / current_price * 100)
            }
        
        except Exception as e:
            logger.error(f"Error in linear prediction: {str(e)}")
            return {'error': str(e)}
    
    def _predict_moving_average(self, prices: List[float], days_ahead: int) -> Dict:
        """Simple moving average based prediction"""
        try:
            prices_array = np.array(prices)
            
            # Calculate moving averages
            ma_3 = np.convolve(prices_array, np.ones(3)/3, mode='valid')
            ma_7 = np.convolve(prices_array, np.ones(7)/7, mode='valid') if len(prices) >= 7 else ma_3
            
            # Simple extrapolation
            last_ma = ma_7[-1] if len(ma_7) > 0 else prices_array[-1]
            trend_direction = prices_array[-1] - prices_array[-min(3, len(prices_array))]
            
            predictions = []
            for i in range(days_ahead):
                pred = last_ma + (trend_direction * (i + 1) / days_ahead)
                predictions.append(float(pred))
            
            current_price = prices_array[-1]
            avg_prediction = np.mean(predictions)
            trend = "📈 UP" if avg_prediction > current_price else "📉 DOWN"
            
            confidence = 60  # Medium confidence for simple MA
            
            return {
                'predictions': predictions,
                'trend': trend,
                'confidence': confidence,
                'current_price': current_price,
                'predicted_avg': avg_prediction,
                'change_percent': ((avg_prediction - current_price) / current_price * 100)
            }
        
        except Exception as e:
            logger.error(f"Error in MA prediction: {str(e)}")
            return {'error': str(e)}
    
    def analyze_volatility(self, historical_prices: List[float]) -> Dict:
        """
        Analyze price volatility
        
        Args:
            historical_prices: List of historical prices
        
        Returns:
            Dictionary with volatility metrics
        """
        try:
            prices_array = np.array(historical_prices)
            
            # Calculate returns
            returns = np.diff(prices_array) / prices_array[:-1]
            
            # Calculate metrics
            volatility = np.std(returns) * 100
            daily_volatility = np.std(np.diff(prices_array)) 
            
            max_price = np.max(prices_array)
            min_price = np.min(prices_array)
            price_range = max_price - min_price
            
            return {
                'volatility_percent': float(volatility),
                'daily_volatility': float(daily_volatility),
                'max_price': float(max_price),
                'min_price': float(min_price),
                'price_range': float(price_range),
                'risk_level': self._get_risk_level(volatility)
            }
        
        except Exception as e:
            logger.error(f"Error analyzing volatility: {str(e)}")
            return {'error': str(e)}
    
    @staticmethod
    def _get_risk_level(volatility: float) -> str:
        """Determine risk level based on volatility"""
        if volatility < 2:
            return "🟢 منخفض جداً (Very Low)"
        elif volatility < 5:
            return "🟢 منخفض (Low)"
        elif volatility < 10:
            return "🟡 متوسط (Medium)"
        elif volatility < 20:
            return "🔴 عالي (High)"
        else:
            return "🔴 عالي جداً (Very High)"
    
    def calculate_resistance_support(self, prices: List[float]) -> Dict:
        """
        Calculate support and resistance levels
        
        Args:
            prices: Historical prices
        
        Returns:
            Dictionary with support and resistance levels
        """
        try:
            prices_array = np.array(prices)
            
            # Simple approach: use percentiles
            support = float(np.percentile(prices_array, 25))
            resistance = float(np.percentile(prices_array, 75))
            current = float(prices_array[-1])
            
            return {
                'support': support,
                'resistance': resistance,
                'current': current,
                'distance_to_support': ((current - support) / current * 100),
                'distance_to_resistance': ((resistance - current) / current * 100)
            }
        
        except Exception as e:
            logger.error(f"Error calculating levels: {str(e)}")
            return {'error': str(e)}
