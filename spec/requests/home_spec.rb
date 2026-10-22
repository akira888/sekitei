require "rails_helper"

RSpec.describe "Home", type: :request do
  describe "GET /" do
    it "庭を作るボタンを表示する" do
      get root_path

      expect(response).to have_http_status(:ok)
      assert_select "form[action='/gardens'][method='post'] button", text: "庭を作る"
    end
  end
end
