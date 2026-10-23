require "rails_helper"

RSpec.describe "Gardens", type: :request do
  let(:straight) do
    { "type" => "straight", "position" => { "x" => 2, "y" => 1 }, "angle" => 0, "rows" => 8, "rake" => { "tines" => 5, "spacing" => 0.05 } }
  end
  let(:concentric) do
    { "type" => "concentric", "center" => { "x" => 2.75, "y" => 1 }, "innerRadius" => 0.1, "rings" => 3, "rake" => { "tines" => 5, "spacing" => 0.05 } }
  end

  describe "POST /gardens" do
    it "庭を作り、その庭の編集画面へ移る" do
      expect { post gardens_path }.to change(Garden, :count).by(1)

      expect(response).to have_http_status(:see_other)
      expect(response).to redirect_to("/gardens/#{Garden.last.uuid}")
    end
  end

  describe "GET /gardens/:uuid" do
    context "保存した庭の uuid の場合" do
      let(:garden) { Garden.create!(scene: { "version" => 1, "shapes" => [ straight, concentric ] }) }

      # エディタ（Stimulus の scene コントローラ）は、埋め込まれた scene を読み、同じ URL へ保存する。
      # ブラウザの「戻る」では、Turbo の写しもブラウザの HTTP キャッシュも、最初に埋め込んだ scene のままの
      # ページを出すことがある。編集する前の庭に戻ってしまうので、どちらにも取っておかせない
      it "保存した scene と保存先の URL を埋め込み、Turbo とブラウザのキャッシュから外した編集画面を表示する" do
        get "/gardens/#{garden.uuid}"

        expect(response).to have_http_status(:ok)
        editor = Nokogiri::HTML(response.body).at_css("[data-controller='scene']")
        expect(JSON.parse(editor["data-scene-scene-value"])).to eq("version" => 1, "shapes" => [ straight, concentric ])
        expect(editor["data-scene-url-value"]).to eq("/gardens/#{garden.uuid}")
        assert_select "meta[name='turbo-cache-control'][content='no-cache']"
        expect(response.headers["Cache-Control"]).to include("no-store")
      end
    end

    context "存在しない uuid の場合" do
      let(:uuid) { "00000000-0000-4000-8000-000000000000" }

      it "404 を返す" do
        get "/gardens/#{uuid}"

        expect(response).to have_http_status(:not_found)
      end
    end
  end

  describe "PATCH /gardens/:uuid" do
    context "保存した庭の uuid の場合" do
      let(:garden) { Garden.create!(scene: { "version" => 1, "shapes" => [ straight ] }) }

      context "読める形の scene を送った場合" do
        let(:scene) { { "version" => 1, "shapes" => [ straight, concentric ] } }

        it "送られた scene を保存して 204 を返す" do
          patch "/gardens/#{garden.uuid}", params: { scene: }, as: :json

          expect(response).to have_http_status(:no_content)
          expect(garden.reload.scene).to eq("version" => 1, "shapes" => [ straight, concentric ])
        end
      end

      # 空の配列はパラメータの扱いしだいで落ちることがあるので、図形を全部消した庭も確かめる
      context "図形を全部消した scene を送った場合" do
        let(:scene) { { "version" => 1, "shapes" => [] } }

        it "空の庭を保存して 204 を返す" do
          patch "/gardens/#{garden.uuid}", params: { scene: }, as: :json

          expect(response).to have_http_status(:no_content)
          expect(garden.reload.scene).to eq("version" => 1, "shapes" => [])
        end
      end

      context "読めない形の scene を送った場合" do
        let(:scene) { { "version" => 1, "shapes" => "straight" } }

        it "保存せずに 422 を返す" do
          patch "/gardens/#{garden.uuid}", params: { scene: }, as: :json

          expect(response).to have_http_status(:unprocessable_content)
          expect(garden.reload.scene).to eq("version" => 1, "shapes" => [ straight ])
        end
      end
    end

    context "存在しない uuid の場合" do
      let(:uuid) { "00000000-0000-4000-8000-000000000000" }

      it "404 を返す" do
        patch "/gardens/#{uuid}", params: { scene: { "version" => 1, "shapes" => [] } }, as: :json

        expect(response).to have_http_status(:not_found)
      end
    end
  end

  describe "完成した庭" do
    let(:garden) { Garden.create!(scene: { "version" => 1, "shapes" => [ straight ] }).tap { _1.complete("石の庭") } }

    it "GET は完成した庭として、名前と完成済みの印を埋め込んで表示する" do
      get "/gardens/#{garden.uuid}"

      expect(response).to have_http_status(:ok)
      editor = Nokogiri::HTML(response.body).at_css("[data-controller='scene']")
      expect(editor["data-scene-completed-value"]).to eq("true")
      assert_select "h1", text: "石の庭"
    end

    it "PATCH は保存せずに 403 を返す" do
      patch "/gardens/#{garden.uuid}", params: { scene: { "version" => 1, "shapes" => [] } }, as: :json

      expect(response).to have_http_status(:forbidden)
      expect(garden.reload.scene["shapes"]).to eq([ straight ])
    end
  end

  describe "POST /gardens/:uuid/completion" do
    let(:garden) { Garden.create! }

    context "名前を送った場合" do
      it "名前を付けて完成させ、204 を返す" do
        post "/gardens/#{garden.uuid}/completion", params: { name: "石の庭" }, as: :json

        expect(response).to have_http_status(:no_content)
        expect(garden.reload).to be_completed
        expect(garden.name).to eq("石の庭")
      end
    end

    context "名前が空の場合" do
      it "完成させずに 422 を返す" do
        post "/gardens/#{garden.uuid}/completion", params: { name: "" }, as: :json

        expect(response).to have_http_status(:unprocessable_content)
        expect(garden.reload).not_to be_completed
      end
    end

    context "完成した庭の場合" do
      before { garden.complete("石の庭") }

      it "名前を変えずに 409 を返す" do
        post "/gardens/#{garden.uuid}/completion", params: { name: "別の名前" }, as: :json

        expect(response).to have_http_status(:conflict)
        expect(garden.reload.name).to eq("石の庭")
      end
    end
  end

  # 共有が始まるので、1つの IP からの作成・保存・完成の回数を制限する
  describe "回数の制限" do
    let(:garden) { Garden.create! }

    it "庭を作るのは 3分に 10回まで" do
      10.times { post gardens_path }
      expect(response).to have_http_status(:see_other)

      post gardens_path
      expect(response).to have_http_status(:too_many_requests)
    end

    it "保存は 1分に 120回まで" do
      120.times { patch "/gardens/#{garden.uuid}", params: { scene: { "version" => 1, "shapes" => [] } }, as: :json }
      expect(response).to have_http_status(:no_content)

      patch "/gardens/#{garden.uuid}", params: { scene: { "version" => 1, "shapes" => [] } }, as: :json
      expect(response).to have_http_status(:too_many_requests)
    end

    it "完成は 1分に 10回まで" do
      10.times { post "/gardens/#{garden.uuid}/completion", params: { name: "" }, as: :json }
      expect(response).to have_http_status(:unprocessable_content)

      post "/gardens/#{garden.uuid}/completion", params: { name: "石の庭" }, as: :json
      expect(response).to have_http_status(:too_many_requests)
    end
  end
end
