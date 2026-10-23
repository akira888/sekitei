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

    it "図形のない空の庭から、砂利の縁ありで始める" do
      garden = Garden.create!

      expect(garden.reload.scene).to eq("version" => 1, "shapes" => [], "gravel" => { "edge" => true })
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

    # 石を足す前の庭には stones がない。クライアントは空の配列として読む
    context "石の配列もある場合" do
      let(:scene) { { "version" => 1, "shapes" => [], "stones" => [ { "type" => "stone" } ] } }

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
      "図形がオブジェクトでない場合" => { "version" => 1, "shapes" => [ 1 ] },
      "stones が配列でない場合" => { "version" => 1, "shapes" => [], "stones" => {} },
      "石がオブジェクトでない場合" => { "version" => 1, "shapes" => [], "stones" => [ 1 ] },
      "砂利の設定がオブジェクトでない場合" => { "version" => 1, "shapes" => [], "gravel" => true },
      "視点がオブジェクトでない場合" => { "version" => 1, "shapes" => [], "camera" => 30 }
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

  describe "#complete" do
    subject(:garden) { Garden.create! }

    it "名前を付けて完成させる。前後の空白は除く" do
      expect(garden.complete("  石の庭  ")).to be(true)

      garden.reload
      expect(garden.name).to eq("石の庭")
      expect(garden.completed_at).to be_present
      expect(garden).to be_completed
    end

    it "名前は 100文字まで付けられる" do
      expect(garden.complete("石" * 100)).to be(true)
    end

    {
      "名前が空の場合" => "",
      "名前が空白だけの場合" => "   ",
      "名前が 100文字を超える場合" => "石" * 101
    }.each do |condition, name|
      context condition do
        it "完成させない" do
          expect(garden.complete(name)).to be(false)
          expect(garden.errors).to include(:name)
          expect(garden.reload).not_to be_completed
        end
      end
    end

    it "完成させる前は名前がなくてよい" do
      expect(Garden.create!).to be_valid
    end

    context "完成した庭の場合" do
      before { garden.complete("石の庭") }

      it "もう一度は完成させない" do
        expect(garden.complete("別の名前")).to be(false)
        expect(garden.reload.name).to eq("石の庭")
      end

      it "scene を変えられない" do
        garden.scene = { "version" => 1, "shapes" => [ { "type" => "straight" } ] }

        expect(garden).not_to be_valid
        expect(garden.errors).to be_of_kind(:scene, :completed)
      end
    end
  end

  # 共有された庭を開いた人の画面が重くならないよう、また保存の送信の上限（keepalive の 64KiB）に合わせて上限を設ける
  describe "scene の大きさ" do
    let(:shapes) { Array.new(count) { { "type" => "straight", "note" => "x" * 100 } } }
    subject(:garden) { Garden.new(scene: { "version" => 1, "shapes" => shapes }) }

    context "JSON にして 64KiB 以内の場合" do
      let(:count) { 400 } # 約 52KB

      it "保存できる" do
        expect(garden).to be_valid
      end
    end

    context "JSON にして 64KiB を超える場合" do
      let(:count) { 600 } # 約 78KB

      it "保存できない" do
        expect(garden).not_to be_valid
        expect(garden.errors).to be_of_kind(:scene, :too_large)
      end
    end
  end
end
