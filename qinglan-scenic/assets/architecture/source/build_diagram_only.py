"""Derive a tightly cropped, diagram-only variant without changing the original."""
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT=Path(__file__).resolve().parents[1]
NS='http://www.w3.org/2000/svg'
ET.register_namespace('',NS)
REMOVE_TEXT={
 '智慧景区 AI 协同运行架构',
 '数据感知 · 智能研判 · 人工处置 · 反馈闭环',
 '现有系统',
 '我们开发的 AI 部分',
 '感知 → 分析 → 行动 → 反馈',
}
REMOVE_PATH={'M64 156 H1856','M692 188 V1006'}
for source,target in [
 (ROOT/'智慧景区-AI协同运行架构.svg',ROOT/'智慧景区-AI协同运行架构-纯图.svg'),
 (ROOT/'source'/'智慧景区-AI协同运行架构-文字可编辑.svg',ROOT/'source'/'智慧景区-AI协同运行架构-纯图-文字可编辑.svg'),
]:
 tree=ET.parse(source); root=tree.getroot(); removed=0
 for child in list(root):
  tag=child.tag.rsplit('}',1)[-1]
  label=child.get('aria-label') if tag=='g' else child.text if tag=='text' else None
  if label in REMOVE_TEXT or (tag=='path' and child.get('d') in REMOVE_PATH):
   root.remove(child); removed+=1
 assert removed==7, removed
 root.set('viewBox','48 242 1856 792')
 root.set('width','1920'); root.set('height','820')
 tree.write(target,encoding='unicode',xml_declaration=False)
 print(target.name)
