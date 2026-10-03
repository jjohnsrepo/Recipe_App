import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

from app import app
from shopping_list import generate_shopping_list


class ShoppingListTests(unittest.TestCase):
    def test_returns_model_text_verbatim(self):
        raw_text = "  2 cups flour\n1 1/2 cups sugar\n"
        client = Mock()
        client.chat.completions.create.return_value = SimpleNamespace(
            choices=[SimpleNamespace(message=SimpleNamespace(content=raw_text))]
        )
        with patch("shopping_list._get_client", return_value=client), patch(
            "shopping_list._get_model", return_value="test-model"
        ):
            result = generate_shopping_list(["1 cup flour", "1 cup flour"])

        self.assertEqual(result, raw_text)
        call = client.chat.completions.create.call_args.kwargs
        self.assertEqual(call["model"], "test-model")
        self.assertEqual(call["messages"][1]["content"], '["1 cup flour", "1 cup flour"]')
        self.assertNotIn("response_format", call)

    def test_empty_input_skips_model(self):
        with patch("shopping_list._get_client") as get_client:
            self.assertEqual(generate_shopping_list([]), "")
        get_client.assert_not_called()

    def test_endpoint_returns_model_text_and_deduplicates_recipe_ids(self):
        recipes = {
            1: {"ingredients": ["1 egg"]},
            2: {"ingredients": ["2 eggs"]},
        }
        raw_text = "3 large eggs\n"
        with patch("app.get_recipe_by_id", side_effect=recipes.get), patch(
            "app.generate_shopping_list", return_value=raw_text
        ) as generate:
            response = app.test_client().post("/api/shopping-list", json={"recipe_ids": [1, 2, 1]})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json, {"shopping_list": raw_text, "recipe_count": 2})
        generate.assert_called_once_with(["1 egg", "2 eggs"])

    def test_endpoint_rejects_invalid_or_missing_recipes(self):
        client = app.test_client()
        self.assertEqual(client.post("/api/shopping-list", json={"recipe_ids": []}).status_code, 400)
        self.assertEqual(client.post("/api/shopping-list", json={"recipe_ids": [True]}).status_code, 400)
        with patch("app.get_recipe_by_id", return_value=None):
            self.assertEqual(client.post("/api/shopping-list", json={"recipe_ids": [123]}).status_code, 404)


if __name__ == "__main__":
    unittest.main()
