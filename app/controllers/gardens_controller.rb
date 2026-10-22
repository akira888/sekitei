# 庭を作り、uuid の URL で編集する。保存はエディタが操作のたびに scene を JSON で PATCH する
class GardensController < ApplicationController
  before_action :set_garden, only: %i[show update]

  def create
    garden = Garden.create!
    redirect_to garden, status: :see_other
  end

  # ページに埋め込む scene は表示したときのもの。ブラウザが「戻る」で HTTP キャッシュの古いページを出すと
  # 編集する前の庭に戻り、次の保存で新しい内容を上書きしてしまうので、キャッシュさせない
  def show
    no_store
  end

  def update
    if @garden.update(scene: params.expect(scene: {}).to_h)
      head :no_content
    else
      render json: { errors: @garden.errors.full_messages }, status: :unprocessable_content
    end
  end

  private

  def set_garden
    @garden = Garden.find_by!(uuid: params[:uuid])
  end
end
