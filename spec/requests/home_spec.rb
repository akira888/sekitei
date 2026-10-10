require "rails_helper"

RSpec.describe "Home", type: :request do
  describe "GET /" do
    it "3D シーンをマウントする要素を表示する" do
      get root_path

      expect(response).to have_http_status(:ok)
      expect(response.body).to include('data-controller="scene"')
    end
  end
end
