# ComfyUI-GaussianViewer

[中文](README.md) | [English](README_EN.md)

[![License: GPL-3.0-or-later](https://img.shields.io/badge/License-GPL--3.0--or--later-blue.svg)](LICENSE)

为 ComfyUI 提供高斯泼溅（Gaussian Splatting）PLY 文件的交互式 3D 预览和高质量图像输出功能。

**注意**：本插件基于 [ComfyUI-GeometryPack](https://github.com/PozzettiAndrea/ComfyUI-GeometryPack) 改进而来，当前版本将预览与渲染合并为单一节点（`GaussianViewer`）。

## 功能特性

- 🎨 **交互式 3D 预览** - 在 ComfyUI 中实时预览 Gaussian Splatting PLY 文件
- 📸 **高质量渲染** - 输出 2048px 短边的高分辨率图像
- 🖼️ **参考图像叠加** - 可选输入参考图像，自动作为预览叠加层
- 🎥 **相机参数控制** - 支持外参（extrinsics）和内参（intrinsics）输入
- 💾 **相机状态缓存** - 自动保存和恢复相机视角参数
- 🔗 **无缝集成** - 输出 IMAGE 可直接连接到 ComfyUI 其他节点
- 🌐 **Web 界面** - 基于 gsplat.js 的现代 3D 查看器

## 安装

### 方法 1: 从 GitHub 安装

```bash
cd ComfyUI/custom_nodes
git clone https://github.com/CarlMarkswx/comfyui-GaussianViewer.git
```

### 方法 2: 手动安装

1. 下载此仓库的 ZIP 文件
2. 解压到 `ComfyUI/custom_nodes/` 目录
3. 重命名文件夹为 `comfyui-GaussianViewer`

### 依赖项

插件依赖于以下 Python 包（通常已随 ComfyUI 安装）：

```
numpy
torch
Pillow
```

如果遇到依赖问题，可以手动安装：

```bash
pip install numpy torch Pillow
```

## 使用方法

### 主要节点

插件提供以下节点：

#### GaussianViewer

这是主节点，集成了预览与渲染功能（推荐使用）。旧版预览/渲染分离节点已弃用并默认隐藏。

**输入参数**：
- `ply_path`（必需）：Gaussian Splatting PLY 文件路径
- `extrinsics`（可选）：4x4 相机外参矩阵，用于设置初始视角
- `intrinsics`（可选）：3x3 相机内参矩阵，用于设置视场角
- `image`（可选）：参考图像，用于在预览界面叠加显示

**输出**：
- `image`：渲染后的图像（IMAGE 类型）

**使用步骤**：
1. 在节点中连接 PLY 文件路径
2. 在预览窗口中调整相机视角
3. **重要**：点击 "Set Camera" 按钮来设置相机位置
4. 节点会渲染并输出当前视角的图像（IMAGE）
5. 可选：输入参考图像作为预览叠加层，便于对齐对比
6. 输出的图像可用于后续处理

### 工作流示例

#### 基础预览和渲染

```
[PLY 文件路径] → [GaussianViewer] → [图像输出]
```

#### 使用相机参数

```
[PLY 文件路径] + [相机外参] + [相机内参] → [GaussianViewer] → [图像输出]
```

#### 叠加参考图像

```
[PLY 文件路径] + [参考图像] → [GaussianViewer] → [图像输出]
```

#### 集成到复杂工作流

```
[PLY 文件路径] → [GaussianViewer] → [图像处理节点] → [保存/显示]
```

### 查看器操作说明（View 节点）

在 GaussianViewer 节点下方的内嵌查看器中可进行如下操作：

- **鼠标操作**
  - 左键拖动：旋转视角（Orbit）
  - 右键拖动：平移视角（Pan）
  - 滚轮：缩放（Zoom）
- **键盘快捷键**（点击 `?` 可查看提示）
  - `W/A/S/D` 或方向键：平移
  - `Q/E`：左右偏航（Yaw）
  - `R/F`：上下俯仰（Pitch）
  - `Z/C`：滚转（Roll）
  - `Shift`：精细移动（0.1x）
- **底部控制条**
  - `Reset View`：重置视角
  - `Set Camera`：将当前视角写入相机缓存，供渲染输出使用（**渲染前必须点击**）
  - `Scale`：调整高斯点大小（可改善稀疏/过密）
  - `Focal`：缩放焦距，影响视场角
  - `Overlay`：当输入参考图像时，可调节叠加透明度
- **比例裁剪**
  - 左下角 `Image Ratio` 可切换输出比例，渲染时会按当前比例裁剪输出。

## 技术细节

### 相机参数

相机参数用于控制 3D 场景的视角和投影：

- **外参（Extrinsics）**：4x4 矩阵，定义相机在世界坐标系中的位置和旋转
- **内参（Intrinsics）**：3x3 矩阵，定义相机的焦距和主点，影响视场角

### 渲染分辨率

- 默认输出分辨率：短边 2048 像素
- 长边根据相机缓存的图像尺寸或内参推导的宽高比自动计算
- 输出格式：RGB 彩色图像（0-1 范围的浮点数）

### 输出文件名

渲染的图像会自动保存到 ComfyUI 的输出目录，文件名格式：

```
gaussian-{PLY文件名}-render-{时间戳}.png
```

### 相机状态缓存

插件会自动缓存每个 PLY 文件的相机状态，包括：
- 相机位置（position）
- 观察目标（target）
- 焦距（fx, fy）
- 图像尺寸（image_width, image_height）
- 缩放因子（scale）
- 缩放补偿（scale_compensation）

这些状态会在节点重新执行时自动恢复。

## 文件结构

```
comfyui-GaussianViewer/
├── __init__.py                 # 插件入口和节点注册
├── gaussian_viewer.py          # 主节点（预览+渲染）
├── render_gaussian.py          # 渲染逻辑与 HTTP 端点（内部使用）
├── preview_gaussian2.py        # 旧版预览节点（已弃用）
├── camera_params.py            # 相机参数缓存模块
├── requirements.txt            # Python 依赖
└── web/                        # Web 界面和 JavaScript 文件
    ├── viewer_gaussian_v2.html # 预览查看器界面
    ├── viewer_render_gaussian.html # 渲染查看器界面
    └── js/                     # JavaScript 模块
        ├── gsplat-bundle.js    # gsplat.js 库
        ├── gaussian_preview_v2.js
        └── render_gaussian.js
```

## 故障排除

### 问题 1：PLY 文件无法加载

**可能原因**：
- 文件路径不正确
- 文件不在 ComfyUI 的输出目录中

**解决方案**：
- 确认 PLY 文件路径正确
- 将 PLY 文件放在 ComfyUI 的输出目录中

### 问题 2：渲染超时

**可能原因**：
- PLY 文件过大
- 系统资源不足

**解决方案**：
- 减小 PLY 文件的大小
- 关闭其他占用资源的程序
- 增加超时时间（修改 `render_gaussian.py` 中的 timeout 参数）

### 问题 3：图像输出为空白

**可能原因**：
- PLY 文件损坏
- 相机参数不正确

**解决方案**：
- 检查 PLY 文件是否有效
- 尝试不提供相机参数，使用默认视角

### 问题 4：插件节点未显示

**可能原因**：
- 插件未正确安装
- ComfyUI 未重启

**解决方案**：
- 确认插件安装在 `ComfyUI/custom_nodes/` 目录
- 重启 ComfyUI
- 检查控制台是否有错误信息

## 开发

### 构建和测试

```bash
# 克隆仓库
git clone https://github.com/CarlMarkswx/comfyui-GaussianViewer.git
cd comfyui-GaussianViewer

# 安装依赖（如需要）
pip install -r requirements.txt

# 重启 ComfyUI 以加载插件
```

### 贡献

欢迎提交 Issue 和 Pull Request！

## 许可证

本项目采用 [GPL-3.0-or-later](LICENSE) 许可证。

## 致谢

- [gsplat.js](https://github.com/antimatter15/splat) - 用于 3D 渲染的 JavaScript 库
- [ComfyUI](https://github.com/comfyanonymous/ComfyUI) - 强大的节点式图像生成界面

## 联系方式

- GitHub: [CarlMarkswx/comfyui-GaussianViewer](https://github.com/CarlMarkswx/comfyui-GaussianViewer)
- Issues: [GitHub Issues](https://github.com/CarlMarkswx/comfyui-GaussianViewer/issues)

---

**注意**：此插件为 ComfyUI 的自定义节点插件，需要安装 [ComfyUI](https://github.com/comfyanonymous/ComfyUI) 才能使用。
