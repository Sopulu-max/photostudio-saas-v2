import React from 'react';

export type VisualNode = {
  id: string;
  type: 'Container' | 'Text' | 'Button' | 'Image' | 'Grid' | 'Form' | 'Input' | 'Select' | 'Option' | 'TextArea' | 'Heading';
  props: Record<string, any>;
  children?: VisualNode[];
  bind?: string;
};

interface RendererProps {
  node: VisualNode;
  dataContext?: Record<string, any>;
  formAction?: any;
}

function resolveBinding(path: string, obj: any) {
  return path.split('.').reduce((prev, curr) => {
    return prev ? prev[curr] : null;
  }, obj);
}

export const Renderer: React.FC<RendererProps> = ({ node, dataContext = {}, formAction }) => {
  // If this node binds to data, we try to resolve it. 
  // Mostly used for text content, or specific props (like image URLs)
  let resolvedText = node.props?.text;
  if (node.bind) {
    const boundValue = resolveBinding(node.bind, dataContext);
    if (boundValue !== undefined && boundValue !== null) {
      resolvedText = String(boundValue);
    }
  }

  const { style = {}, className = '', ...otherProps } = node.props || {};

  switch (node.type) {
    case 'Container':
      return (
        <div style={style} className={className} {...otherProps}>
          {node.children?.map(child => (
            <Renderer key={child.id} node={child} dataContext={dataContext} formAction={formAction} />
          ))}
        </div>
      );
    case 'Grid':
      return (
        <div style={{ display: 'grid', ...style }} className={className} {...otherProps}>
          {node.children?.map(child => (
            <Renderer key={child.id} node={child} dataContext={dataContext} formAction={formAction} />
          ))}
        </div>
      );
    case 'Heading': {
      const Tag = (node.props.level ? `h${node.props.level}` : 'h2') as any;
      return (
        <Tag style={style} className={className} {...otherProps}>
          {resolvedText}
          {node.children?.map(child => (
            <Renderer key={child.id} node={child} dataContext={dataContext} formAction={formAction} />
          ))}
        </Tag>
      );
    }
    case 'Text':
      return (
        <span style={style} className={className} {...otherProps}>
          {resolvedText}
        </span>
      );
    case 'Button':
      return (
        <button style={style} className={`q-btn ${className}`} {...otherProps}>
          {resolvedText}
        </button>
      );
    case 'Image':
      return (
        <img 
          src={node.props.src || resolveBinding(node.bind || '', dataContext)} 
          alt={node.props.alt || ''} 
          style={style} 
          className={className} 
          {...otherProps} 
        />
      );
    case 'Form':
      return (
        <form action={node.props.action || formAction} style={style} className={className} {...otherProps}>
          {node.children?.map(child => (
            <Renderer key={child.id} node={child} dataContext={dataContext} formAction={formAction} />
          ))}
        </form>
      );
    case 'Input':
      return <input style={style} className={className} {...otherProps} />;
    case 'TextArea':
      return <textarea style={style} className={className} {...otherProps} />;
    case 'Select':
      return (
        <select style={style} className={className} {...otherProps}>
          {node.children?.map(child => (
            <Renderer key={child.id} node={child} dataContext={dataContext} formAction={formAction} />
          ))}
        </select>
      );
    case 'Option':
      return (
        <option style={style} className={className} {...otherProps}>
          {resolvedText}
        </option>
      );
    default:
      return null;
  }
};
