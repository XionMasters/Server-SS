// src/models/UserSession.ts
import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';
import User from './User';

class UserSession extends Model {
  declare id: string;
  declare user_id: string;
  declare token: string;
  declare is_active: boolean;
  declare created_at: Date;
  declare expires_at: Date;
  declare ip_address: string | null;
  declare user_agent: string | null;
}

UserSession.init(
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    token: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    expires_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    ip_address: {
      type: DataTypes.STRING,
      allowNull: true
    },
    user_agent: {
      type: DataTypes.STRING,
      allowNull: true
    }
  },
  {
    sequelize,
    tableName: 'user_sessions',
    timestamps: false,
    underscored: true
  }
);

// Relaciones
UserSession.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
User.hasMany(UserSession, { foreignKey: 'user_id', as: 'sessions' });

export default UserSession;
