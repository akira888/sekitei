require "rails_helper"

RSpec.describe Garden, type: :model do
  describe "作成" do
    it "URL に使う uuid（v4）を振る" do
      garden = Garden.create!

      expect(garden.uuid).to match(/\A\h{8}-\h{4}-4\h{3}-[89ab]\h{3}-\h{12}\z/)
    end

    it "庭ごとに別の uuid を振る" do
      expect(Garden.create!.uuid).not_to eq(Garden.create!.uuid)
    end

    it "図形のない空の庭から始める" do
      garden = Garden.create!

      expect(garden.reload.scene).to eq("version" => 1, "shapes" => [])
    end
  end

  # 中身はクライアントが読む。サーバーは読めなくなる形だけを弾き、図形ごとの値までは見ない
  describe "scene の検証" do
    subject(:garden) { Garden.new(scene:) }

    context "version と図形の配列がある場合" do
      let(:scene) { { "version" => 1, "shapes" => [ { "type" => "straight" } ] } }

      it "正しい scene とみなす" do
        expect(garden).to be_valid
      end
    end

    {
      "scene がない場合" => nil,
      "scene がオブジェクトでない場合" => [],
      "version がない場合" => { "shapes" => [] },
      "version が文字列の場合" => { "version" => "1", "shapes" => [] },
      "version が 0 の場合" => { "version" => 0, "shapes" => [] },
      "shapes がない場合" => { "version" => 1 },
      "shapes が配列でない場合" => { "version" => 1, "shapes" => {} },
      "図形がオブジェクトでない場合" => { "version" => 1, "shapes" => [ 1 ] }
    }.each do |condition, value|
      context condition do
        let(:scene) { value }

        it "正しくない scene とみなす" do
          expect(garden).not_to be_valid
          expect(garden.errors).to be_of_kind(:scene, :invalid)
        end
      end
    end
  end
end
