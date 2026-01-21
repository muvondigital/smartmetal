"""
Test Azure Custom Vision Model Predictions
Quick script to test your trained model
"""

import os
import sys
import argparse
from pathlib import Path

try:
    from azure.cognitiveservices.vision.customvision.prediction import CustomVisionPredictionClient
    from msrest.authentication import ApiKeyCredentials
    from dotenv import load_dotenv
except ImportError:
    print("❌ Missing dependencies. Install with:")
    print("   pip install azure-cognitiveservices-vision-customvision python-dotenv")
    sys.exit(1)


def test_prediction(image_path, project_id, published_name="production", threshold=0.5):
    """Test prediction on a single image"""

    # Load environment variables
    load_dotenv()

    endpoint = os.getenv('AZURE_CUSTOM_VISION_PREDICTION_ENDPOINT')
    key = os.getenv('AZURE_CUSTOM_VISION_PREDICTION_KEY')

    if not endpoint or not key:
        print("❌ Missing Azure Custom Vision credentials")
        print("   Set AZURE_CUSTOM_VISION_PREDICTION_ENDPOINT and AZURE_CUSTOM_VISION_PREDICTION_KEY")
        sys.exit(1)

    # Initialize client
    credentials = ApiKeyCredentials(in_headers={"Prediction-key": key})
    predictor = CustomVisionPredictionClient(endpoint, credentials)

    # Load image
    if not os.path.exists(image_path):
        print(f"❌ Image not found: {image_path}")
        sys.exit(1)

    print(f"\n🔍 Testing prediction on: {image_path}")
    print(f"📦 Project ID: {project_id}")
    print(f"🏷️  Published Name: {published_name}")
    print()

    try:
        # Make prediction
        with open(image_path, 'rb') as f:
            results = predictor.classify_image(
                project_id,
                published_name,
                f.read()
            )

        # Display results
        print("="*60)
        print("📊 PREDICTION RESULTS")
        print("="*60)

        predictions = sorted(results.predictions, key=lambda p: p.probability, reverse=True)

        if not predictions:
            print("⚠️  No predictions returned")
            return

        # Show all predictions
        print("\nAll predictions:")
        for i, pred in enumerate(predictions, 1):
            confidence = pred.probability * 100
            status = "✅" if pred.probability >= threshold else "⏭️ "

            print(f"{status} {i}. {pred.tag_name}: {confidence:.2f}%")

        # Top prediction
        top = predictions[0]
        print(f"\n🎯 Top Prediction: {top.tag_name} ({top.probability*100:.2f}%)")

        # Confidence assessment
        if top.probability >= 0.9:
            print("   Confidence: 🟢 HIGH - Auto-accept recommended")
        elif top.probability >= 0.7:
            print("   Confidence: 🟡 MEDIUM - Show to user for confirmation")
        else:
            print("   Confidence: 🔴 LOW - Require manual entry")

        print("="*60)

        # Return structured result
        return {
            'top_prediction': top.tag_name,
            'confidence': top.probability,
            'all_predictions': [
                {'tag': p.tag_name, 'confidence': p.probability}
                for p in predictions
            ]
        }

    except Exception as e:
        print(f"❌ Prediction failed: {e}")
        print("\nTroubleshooting:")
        print("1. Check project ID is correct")
        print("2. Check model is published")
        print("3. Verify Azure credentials")
        return None


def batch_test(image_dir, project_id, published_name="production"):
    """Test predictions on multiple images"""

    image_extensions = {'.jpg', '.jpeg', '.png', '.bmp'}
    image_files = []

    for ext in image_extensions:
        image_files.extend(Path(image_dir).glob(f'*{ext}'))

    if not image_files:
        print(f"❌ No images found in: {image_dir}")
        return

    print(f"\n🔍 Testing {len(image_files)} images from: {image_dir}\n")

    results = []
    for img_path in image_files:
        result = test_prediction(img_path, project_id, published_name, threshold=0.5)
        if result:
            results.append({
                'filename': img_path.name,
                **result
            })
        print()

    # Summary
    if results:
        print("\n" + "="*60)
        print("📊 BATCH TEST SUMMARY")
        print("="*60)

        high_confidence = sum(1 for r in results if r['confidence'] >= 0.9)
        medium_confidence = sum(1 for r in results if 0.7 <= r['confidence'] < 0.9)
        low_confidence = sum(1 for r in results if r['confidence'] < 0.7)

        print(f"Total tested: {len(results)}")
        print(f"🟢 High confidence (≥90%): {high_confidence} ({high_confidence/len(results)*100:.1f}%)")
        print(f"🟡 Medium confidence (70-90%): {medium_confidence} ({medium_confidence/len(results)*100:.1f}%)")
        print(f"🔴 Low confidence (<70%): {low_confidence} ({low_confidence/len(results)*100:.1f}%)")

        # Show low confidence items for review
        if low_confidence > 0:
            print("\n⚠️  Low confidence predictions (review these):")
            for r in results:
                if r['confidence'] < 0.7:
                    print(f"   {r['filename']}: {r['top_prediction']} ({r['confidence']*100:.1f}%)")

        print("="*60)


def main():
    parser = argparse.ArgumentParser(description='Test Azure Custom Vision predictions')
    parser.add_argument('--image', help='Single image to test')
    parser.add_argument('--image-dir', help='Directory of images to test')
    parser.add_argument('--project-id', required=True, help='Custom Vision project ID')
    parser.add_argument('--published-name', default='production', help='Published iteration name')
    parser.add_argument('--threshold', type=float, default=0.5, help='Confidence threshold for display')

    args = parser.parse_args()

    if args.image:
        test_prediction(args.image, args.project_id, args.published_name, args.threshold)
    elif args.image_dir:
        batch_test(args.image_dir, args.project_id, args.published_name)
    else:
        print("❌ Specify either --image or --image-dir")
        sys.exit(1)


if __name__ == '__main__':
    main()
