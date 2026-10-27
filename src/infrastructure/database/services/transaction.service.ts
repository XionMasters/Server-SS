// Sequelize-backed transaction ledger service.
import UserTransaction, { TransactionType, TransactionReason } from '../models/UserTransaction';
import UserCardTransaction, { CardTransactionType, CardTransactionReason } from '../models/UserCardTransaction';
import User from '../models/User';
import { Transaction } from 'sequelize';

class TransactionService {
  /**
   * Registrar transacción de monedas
   */
  async logCurrencyTransaction(
    userId: string,
    amount: number,
    type: TransactionType,
    reason: TransactionReason,
    description: string,
    relatedEntityType?: string,
    relatedEntityId?: string,
    metadata?: object,
    transaction?: Transaction,
    balance?: { before: number; after: number }
  ): Promise<UserTransaction> {
    let balanceBefore: number;
    let balanceAfter: number;

    if (balance) {
      balanceBefore = balance.before;
      balanceAfter = balance.after;
    } else {
      const user = await User.findByPk(userId, { transaction });
      if (!user) {
        throw new Error('Usuario no encontrado');
      }

      balanceBefore = user.currency;
      balanceAfter = type === 'EARN'
        ? balanceBefore + amount
        : balanceBefore - amount;
    }

    const ledgerTransaction = await UserTransaction.create({
      user_id: userId,
      amount,
      type,
      reason,
      description,
      related_entity_type: relatedEntityType || null,
      related_entity_id: relatedEntityId || null,
      balance_before: balanceBefore,
      balance_after: balanceAfter,
      metadata: metadata || {}
    }, { transaction });

    console.log(`💰 ${type}: ${amount} monedas para usuario ${userId} - ${reason}`);
    return ledgerTransaction;
  }

  /**
   * Registrar transacción de cartas
   */
  async logCardTransaction(
    userId: string,
    cardId: string,
    quantity: number,
    type: CardTransactionType,
    reason: CardTransactionReason,
    description: string,
    isfoil: boolean = false,
    relatedEntityType?: string,
    relatedEntityId?: string,
    metadata?: object,
    transaction?: Transaction
  ): Promise<UserCardTransaction> {
    const cardTransaction = await UserCardTransaction.create({
      user_id: userId,
      card_id: cardId,
      quantity,
      type,
      reason,
      description,
      is_foil: isfoil,
      related_entity_type: relatedEntityType || null,
      related_entity_id: relatedEntityId || null,
      metadata: metadata || {}
    }, { transaction });

    console.log(`🃏 ${type}: ${quantity}x carta ${cardId} para usuario ${userId} - ${reason}`);
    return cardTransaction;
  }

  /**
   * Obtener historial de transacciones de monedas de un usuario
   */
  async getUserCurrencyHistory(
    userId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<UserTransaction[]> {
    return await UserTransaction.findAll({
      where: { user_id: userId },
      order: [['created_at', 'DESC']],
      limit,
      offset
    });
  }

  /**
   * Obtener historial de transacciones de cartas de un usuario
   */
  async getUserCardHistory(
    userId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<UserCardTransaction[]> {
    return await UserCardTransaction.findAll({
      where: { user_id: userId },
      include: [{
        model: require('../models/Card').default,
        as: 'card',
        attributes: ['name', 'type', 'rarity']
      }],
      order: [['created_at', 'DESC']],
      limit,
      offset
    });
  }

  /**
   * Obtener estadísticas de transacciones de un usuario
   */
  async getUserTransactionStats(userId: string): Promise<any> {
    const [currencyStats, cardStats] = await Promise.all([
      // Estadísticas de monedas
      UserTransaction.findAll({
        where: { user_id: userId },
        attributes: [
          'type',
          [require('sequelize').fn('SUM', require('sequelize').col('amount')), 'total_amount'],
          [require('sequelize').fn('COUNT', require('sequelize').col('id')), 'transaction_count']
        ],
        group: ['type'],
        raw: true
      }),
      
      // Estadísticas de cartas
      UserCardTransaction.findAll({
        where: { user_id: userId },
        attributes: [
          'type',
          [require('sequelize').fn('SUM', require('sequelize').col('quantity')), 'total_cards'],
          [require('sequelize').fn('COUNT', require('sequelize').col('id')), 'transaction_count']
        ],
        group: ['type'],
        raw: true
      })
    ]);

    return {
      currency: currencyStats,
      cards: cardStats
    };
  }

  /**
   * Obtener transacciones recientes (últimas 24 horas)
   */
  async getRecentActivity(userId: string): Promise<any> {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const [recentCurrency, recentCards] = await Promise.all([
      UserTransaction.findAll({
        where: {
          user_id: userId,
          created_at: {
            [require('sequelize').Op.gte]: yesterday
          }
        },
        order: [['created_at', 'DESC']],
        limit: 10
      }),
      
      UserCardTransaction.findAll({
        where: {
          user_id: userId,
          created_at: {
            [require('sequelize').Op.gte]: yesterday
          }
        },
        include: [{
          model: require('../models/Card').default,
          as: 'card',
          attributes: ['name', 'type', 'rarity']
        }],
        order: [['created_at', 'DESC']],
        limit: 10
      })
    ]);

    return {
      currency_transactions: recentCurrency,
      card_transactions: recentCards
    };
  }
}

export default new TransactionService();